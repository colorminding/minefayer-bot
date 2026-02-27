const fs = require('fs')
const path = require('path')
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')

/**
 * ====== CONFIG via ENV (Pelican Startup Vars) ======
 */
const CFG = {
  host: process.env.MC_HOST || '127.0.0.1',
  port: Number(process.env.MC_PORT || 25565),
  version: process.env.MC_VERSION || '1.21.11',
  username: process.env.MC_USER || cyberpupking@gmail.com',
  auth: process.env.MC_AUTH || 'microsoft',
  profilesFolder: process.env.PROFILES_DIR || './profiles',

  // Optional: how close we need to be to interact
  interactDistance: Number(process.env.INTERACT_DIST || 4.5),

  // Optional: after end, let Pelican restart us
  exitOnDisconnect: (process.env.EXIT_ON_DISCONNECT || '1') === '1'
}

const STATE_FILE = path.join(__dirname, 'state.json')

/**
 * ====== State / Persistence ======
 * state structure:
 * {
 *   "queue": [ {task}, {task} ... ],
 *   "active": {task} | null
 * }
 */
function loadState () {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return { queue: [], active: null }
    }
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  } catch (e) {
    console.log('⚠️ Could not read state.json, resetting. Error:', e?.message || e)
    return { queue: [], active: null }
  }
}

function saveState (state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

/**
 * ====== Task helpers ======
 */
function ensureDefaultQueue (state) {
  // If there’s no work configured yet, put a sane default:
  // 1) AFK forever
  if (!state.active && state.queue.length === 0) {
    state.queue.push({ type: 'afk', everyMs: 5000 })
    saveState(state)
  }
}

/**
 * Task definitions:
 * - goto: { type:'goto', x,y,z, range? }
 * - rightClickBlock: { type:'rightClickBlock', x,y,z, everyMs?, times? }
 * - rightClickItem: { type:'rightClickItem', everyMs?, times? }
 * - afk: { type:'afk', everyMs? }
 * - wait: { type:'wait', ms }
 */
let bot
let state = loadState()
ensureDefaultQueue(state)

/**
 * ====== Bot Start / Reconnect ======
 */
let reconnectDelay = 3000

function startBot () {
  console.log('🟦 Starting bot…')
  bot = mineflayer.createBot({
    host: CFG.host,
    port: CFG.port,
    version: CFG.version,
    username: CFG.username,
    auth: CFG.auth,
    profilesFolder: CFG.profilesFolder
  })

  bot.loadPlugin(pathfinder)

  bot.once('spawn', async () => {
    console.log('✅ Bot joined the server!')
    reconnectDelay = 3000

    // Setup movements
    const mcData = require('minecraft-data')(bot.version)
    const defaultMoves = new Movements(bot, mcData)
    bot.pathfinder.setMovements(defaultMoves)

    // Resume processing
    runLoop().catch(err => console.log('⚠️ runLoop error:', err))
  })

  bot.on('end', () => {
    console.log('🔌 Disconnected.')
    stopAllIntervals()

    if (CFG.exitOnDisconnect) {
      // Let Pelican restart the process (clean & reliable)
      process.exit(1)
    } else {
      // Or do our own reconnect backoff
      setTimeout(startBot, reconnectDelay)
      reconnectDelay = Math.min(reconnectDelay * 2, 60000)
    }
  })

  bot.on('kicked', r => console.log('⛔ Kicked:', r))
  bot.on('error', e => console.log('⚠️ Error:', e?.message || e))
}

/**
 * ====== Interval management for long-running tasks ======
 */
let intervals = []
function setManagedInterval (fn, ms) {
  const id = setInterval(fn, ms)
  intervals.push(id)
  return id
}
function stopAllIntervals () {
  for (const id of intervals) clearInterval(id)
  intervals = []
}

/**
 * ====== Task Execution Loop ======
 */
let running = false

async function runLoop () {
  if (running) return
  running = true

  // If we had an active task when we crashed, keep it as active
  // otherwise pop from queue.
  while (bot && bot.entity) {
    if (!state.active) {
      state.active = state.queue.shift() || null
      saveState(state)
    }
    if (!state.active) {
      // nothing to do, just idle
      await sleep(2000)
      continue
    }

    const task = state.active
    console.log('▶️ Task:', task)

    try {
      await executeTask(task)

      // If executeTask returns, task is done (except infinite tasks, those never return)
      state.active = null
      saveState(state)
    } catch (e) {
      console.log('⚠️ Task error:', e?.message || e)

      // On transient errors, wait and retry same active task.
      await sleep(3000)
    }
  }
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * ====== Task Implementations ======
 */
async function executeTask (task) {
  switch (task.type) {
    case 'wait':
      await sleep(task.ms || 1000)
      return

    case 'goto':
      return await taskGoto(task)

    case 'rightClickBlock':
      return await taskRightClickBlock(task)

    case 'rightClickItem':
      return await taskRightClickItem(task)

    case 'afk':
      return await taskAfk(task)

    default:
      throw new Error('Unknown task type: ' + task.type)
  }
}

async function taskGoto (t) {
  const range = t.range ?? 1
  const goal = new goals.GoalNear(t.x, t.y, t.z, range)
  bot.pathfinder.setGoal(goal, false)

  // Wait until we reach the goal or get stuck
  await waitForGoalOrTimeout(120000) // 2 minutes
  bot.pathfinder.setGoal(null)
}

function waitForGoalOrTimeout (timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now()

    const onGoal = () => cleanup(resolve)
    const onPathReset = (reason) => {
      // path reset can happen; if it’s stuck, fail
      if (reason === 'noPath' || reason === 'stuck') cleanup(() => reject(new Error('Pathfinder: ' + reason)))
    }

    const tick = () => {
      if (Date.now() - start > timeoutMs) cleanup(() => reject(new Error('Timeout while pathfinding')))
    }

    const cleanup = (done) => {
      bot.removeListener('goal_reached', onGoal)
      bot.removeListener('path_reset', onPathReset)
      clearInterval(timer)
      done()
    }

    bot.on('goal_reached', onGoal)
    bot.on('path_reset', onPathReset)
    const timer = setInterval(tick, 500)
  })
}

async function taskRightClickBlock (t) {
  const everyMs = t.everyMs ?? 500
  const times = t.times ?? 0 // 0 = infinite
  let count = 0

  // Ensure we’re close enough; if not, walk near it
  const target = new Vec3(t.x, t.y, t.z)

  // Try to move within interact distance
  await taskGoto({ type: 'goto', x: t.x, y: t.y, z: t.z, range: 2 })

  console.log('🖱️ Starting rightClickBlock loop…')

  return new Promise(async (resolve, reject) => {
    const id = setManagedInterval(async () => {
      try {
        const block = bot.blockAt(target)
        if (!block) return

        // If too far, try to move again
        const dist = bot.entity.position.distanceTo(block.position)
        if (dist > CFG.interactDistance) {
          bot.pathfinder.setGoal(new goals.GoalNear(t.x, t.y, t.z, 2), false)
          return
        }

        await bot.lookAt(block.position, true)
        bot.activateBlock(block)

        count++
        if (times > 0 && count >= times) {
          clearInterval(id)
          resolve()
        }
      } catch (e) {
        clearInterval(id)
        reject(e)
      }
    }, everyMs)
  })
}

async function taskRightClickItem (t) {
  const everyMs = t.everyMs ?? 250
  const times = t.times ?? 0 // 0 = infinite
  let count = 0

  console.log('🖱️ Starting rightClickItem loop…')

  return new Promise((resolve, reject) => {
    const id = setManagedInterval(() => {
      try {
        bot.activateItem()
        count++
        if (times > 0 && count >= times) {
          clearInterval(id)
          resolve()
        }
      } catch (e) {
        clearInterval(id)
        reject(e)
      }
    }, everyMs)
  })
}

async function taskAfk (t) {
  const everyMs = t.everyMs ?? 5000
  console.log('🟩 AFK mode…')

  // Infinite task: never resolves. Keeps process alive.
  setManagedInterval(() => {
    const yaw = bot.entity.yaw + (Math.random() - 0.5) * 0.4
    const pitch = bot.entity.pitch + (Math.random() - 0.5) * 0.2
    bot.look(yaw, pitch, true)
  }, everyMs)

  // block forever
  await new Promise(() => {})
}

/**
 * ====== Bootstrap ======
 */
startBot()
