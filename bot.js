/**
 * Mineflayer Bot for Pelican: Tasks via chat + persistent state + follow/click/attack
 *
 * ENV (Pelican Startup vars):
 * MC_HOST, MC_PORT, MC_VERSION, MC_USER, MC_AUTH=microsoft, PROFILES_DIR=./profiles
 * CONTROL_USERS=YourName,FriendName
 * CMD_PREFIX=!
 * EXIT_ON_DISCONNECT=1
 *
 * Optional:
 * INTERACT_DIST=4.5
 * ATTACK_RANGE=3.2
 * ATTACK_FOV=0.92
 * ATTACK_EVERY_MS=600
 * ATTACK_TYPES=mob (or: mob,player)  // usually keep "mob"
 */

const fs = require('fs')
const path = require('path')
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')

/* ===================== CONFIG ===================== */
const CFG = {
  host: process.env.MC_HOST || '127.0.0.1',
  port: Number(process.env.MC_PORT || 25565),
  version: process.env.MC_VERSION || '1.21.1',
  username: process.env.MC_USER || 'email@example.com',
  auth: process.env.MC_AUTH || 'microsoft',
  profilesFolder: process.env.PROFILES_DIR || './profiles',

  prefix: process.env.CMD_PREFIX || '!',
  controlUsers: (process.env.CONTROL_USERS || '').split(',').map(s => s.trim()).filter(Boolean),

  interactDistance: Number(process.env.INTERACT_DIST || 4.5),

  exitOnDisconnect: (process.env.EXIT_ON_DISCONNECT || '1') === '1',

  attackRange: Number(process.env.ATTACK_RANGE || 3.2),
  // 1.0 = exactly forward, 0.0 = 90° to the side; 0.92 is fairly strict
  attackFovDot: Number(process.env.ATTACK_FOV || 0.92),
  attackEveryMs: Number(process.env.ATTACK_EVERY_MS || 600),
  attackTypes: (process.env.ATTACK_TYPES || 'mob').split(',').map(s => s.trim()).filter(Boolean)
}

const STATE_FILE = path.join(__dirname, 'state.json')

/* ===================== STATE (persistent) ===================== */
function loadState () {
  try {
    if (!fs.existsSync(STATE_FILE)) return { queue: [], active: null }
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  } catch (e) {
    console.log('⚠️ Could not read state.json, resetting. Error:', e?.message || e)
    return { queue: [], active: null }
  }
}
function saveState (state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}
let state = loadState()

function ensureDefaultQueue () {
  if (!state.active && state.queue.length === 0) {
    state.queue.push({ type: 'afk', everyMs: 5000 })
    saveState(state)
  }
}
ensureDefaultQueue()

/* ===================== BOT BOOT ===================== */
let bot
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

function isAllowedController (username) {
  if (CFG.controlUsers.length === 0) return true
  return CFG.controlUsers.includes(username)
}

function stopTasks () {
  stopAllIntervals()
  if (bot?.pathfinder) bot.pathfinder.setGoal(null)
  state.queue = []
  state.active = null
  saveState(state)
}

function pushTask (task) {
  state.queue.push(task)
  saveState(state)
}

function setQueue (tasks) {
  state.queue = tasks
  state.active = null
  saveState(state)
}

/* ===================== TASK LOOP ===================== */
let running = false

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runLoop () {
  if (running) return
  running = true

  while (bot && bot.entity) {
    if (!state.active) {
      state.active = state.queue.shift() || null
      saveState(state)
    }
    if (!state.active) {
      await sleep(1500)
      continue
    }

    const task = state.active
    console.log('▶️ Task:', task)

    try {
      await executeTask(task)
      // Only finite tasks reach here
      state.active = null
      saveState(state)
    } catch (e) {
      console.log('⚠️ Task error:', e?.message || e)
      await sleep(2000)
    }
  }
}

/* ===================== TASKS ===================== */
async function executeTask (task) {
  switch (task.type) {
    case 'wait': return await sleep(task.ms || 1000)
    case 'goto': return await taskGoto(task)
    case 'follow': return await taskFollow(task)
    case 'rightClickItem': return await taskRightClickItem(task)
    case 'rightClickBlock': return await taskRightClickBlock(task)
    case 'attackLoop': return await taskAttackLoop(task)
    case 'afk': return await taskAfk(task)
    default: throw new Error('Unknown task type: ' + task.type)
  }
}

async function taskGoto (t) {
  const range = t.range ?? 1
  bot.pathfinder.setGoal(new goals.GoalNear(t.x, t.y, t.z, range), false)
  await waitForGoalOrTimeout(120000)
  bot.pathfinder.setGoal(null)
}

function waitForGoalOrTimeout (timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now()

    const onGoal = () => cleanup(resolve)
    const onReset = (reason) => {
      if (reason === 'noPath' || reason === 'stuck') cleanup(() => reject(new Error('Pathfinder: ' + reason)))
    }

    const timer = setInterval(() => {
      if (Date.now() - start > timeoutMs) cleanup(() => reject(new Error('Timeout while pathfinding')))
    }, 500)

    const cleanup = (done) => {
      bot.removeListener('goal_reached', onGoal)
      bot.removeListener('path_reset', onReset)
      clearInterval(timer)
      done()
    }

    bot.on('goal_reached', onGoal)
    bot.on('path_reset', onReset)
  })
}

async function taskFollow (t) {
  const targetName = t.player
  const distance = t.distance ?? 3
  const everyMs = t.everyMs ?? 700

  console.log(`👣 Following ${targetName} (distance ${distance})…`)

  setManagedInterval(() => {
    const ent = bot.players[targetName]?.entity
    if (!ent) return
    const p = ent.position
    bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, distance), false)
  }, everyMs)

  // infinite task
  await new Promise(() => {})
}

async function taskRightClickItem (t) {
  const everyMs = t.everyMs ?? 250
  const times = t.times ?? 0
  let count = 0

  console.log(`🖱️ RightClick ITEM loop (${everyMs}ms)…`)

  return await new Promise((resolve, reject) => {
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

async function taskRightClickBlock (t) {
  const everyMs = t.everyMs ?? 500
  const times = t.times ?? 0
  let count = 0

  const target = new Vec3(t.x, t.y, t.z)

  // Move near first
  await taskGoto({ type: 'goto', x: t.x, y: t.y, z: t.z, range: 2 })

  console.log(`🖱️ RightClick BLOCK loop at ${t.x} ${t.y} ${t.z} (${everyMs}ms)…`)

  return await new Promise((resolve, reject) => {
    const id = setManagedInterval(async () => {
      try {
        const block = bot.blockAt(target)
        if (!block) return

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

async function taskAfk (t) {
  const everyMs = t.everyMs ?? 5000
  console.log('🟩 AFK mode…')

  setManagedInterval(() => {
    const yaw = bot.entity.yaw + (Math.random() - 0.5) * 0.4
    const pitch = bot.entity.pitch + (Math.random() - 0.5) * 0.2
    bot.look(yaw, pitch, true)
  }, everyMs)

  await new Promise(() => {})
}

/* ===================== ATTACK UPGRADE ===================== */
/**
 * Choose a target that is:
 * - within range
 * - visible (canSeeEntity)
 * - roughly in front (dot product threshold)
 */
function getLookDirection () {
  // Minecraft yaw/pitch conventions:
  // yaw: 0 = -Z, 90 = -X, 180 = +Z, -90 = +X (approx)
  const yaw = bot.entity.yaw
  const pitch = bot.entity.pitch

  const x = -Math.sin(yaw) * Math.cos(pitch)
  const y = Math.sin(pitch)
  const z = -Math.cos(yaw) * Math.cos(pitch)
  return new Vec3(x, y, z)
}

function dot (a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function pickAttackTarget () {
  const dir = getLookDirection()
  const eye = bot.entity.position.offset(0, bot.entity.height, 0)

  let best = null
  let bestScore = -Infinity

  for (const id in bot.entities) {
    const e = bot.entities[id]
    if (!e) continue

    // Type filter (default "mob" only)
    if (!CFG.attackTypes.includes(e.type)) continue

    // Don't hit yourself
    if (e === bot.entity) continue

    const dist = eye.distanceTo(e.position)
    if (dist > CFG.attackRange) continue

    // Must be visible (no wall)
    if (typeof bot.canSeeEntity === 'function' && !bot.canSeeEntity(e)) continue

    // Must be in front (roughly crosshair-ish)
    const to = e.position.minus(eye)
    const toNorm = to.scaled(1 / Math.max(0.0001, Math.sqrt(dot(to, to))))
    const score = dot(dir, toNorm) // 1 = perfect forward

    if (score < CFG.attackFovDot) continue

    // Prefer closer + more centered:
    const centeredBonus = score * 2.0
    const closeBonus = (CFG.attackRange - dist)
    const total = centeredBonus + closeBonus

    if (total > bestScore) {
      bestScore = total
      best = e
    }
  }
  return best
}

async function taskAttackLoop (t) {
  const everyMs = t.everyMs ?? CFG.attackEveryMs
  console.log(`⚔️ Attack loop (every ${everyMs}ms, range ${CFG.attackRange}, fovDot ${CFG.attackFovDot})…`)

  setManagedInterval(() => {
    // swing looks like left click
    bot.swingArm('right')

    const target = pickAttackTarget()
    if (!target) return

    // Attack only what we picked
    try {
      bot.attack(target)
    } catch {}
  }, everyMs)

  await new Promise(() => {})
}

/* ===================== CHAT COMMANDS ===================== */
function chatHelp () {
  bot.chat(
    [
      'Commands:',
      `${CFG.prefix}help`,
      `${CFG.prefix}stop`,
      `${CFG.prefix}afk`,
      `${CFG.prefix}goto <x> <y> <z> [range]`,
      `${CFG.prefix}follow <player>`,
      `${CFG.prefix}rc  (right-click item loop)`,
      `${CFG.prefix}rcblock <x> <y> <z>  (right-click block loop)`,
      `${CFG.prefix}lc  (attack loop, safe targeting)`,
      `${CFG.prefix}attackcfg  (prints current attack settings)`
    ].join(' | ')
  )
}

function onChat (username, message) {
  if (username === bot.username) return
  if (!message.startsWith(CFG.prefix)) return
  if (!isAllowedController(username)) return

  const args = message.slice(CFG.prefix.length).trim().split(/\s+/)
  const cmd = (args.shift() || '').toLowerCase()

  try {
    if (cmd === 'help') return chatHelp()

    if (cmd === 'stop') {
      stopTasks()
      bot.chat('🛑 Stopped all tasks.')
      return
    }

    if (cmd === 'afk') {
      stopTasks()
      pushTask({ type: 'afk', everyMs: 5000 })
      bot.chat('🟩 AFK mode ON.')
      return
    }

    if (cmd === 'goto') {
      const [x, y, z, range] = args
      if ([x, y, z].some(v => v === undefined)) {
        bot.chat(`Usage: ${CFG.prefix}goto <x> <y> <z> [range]`)
        return
      }
      stopTasks()
      pushTask({ type: 'goto', x: Number(x), y: Number(y), z: Number(z), range: range ? Number(range) : 1 })
      bot.chat(`➡️ Going to ${x} ${y} ${z}`)
      return
    }

    if (cmd === 'follow') {
      const player = args[0]
      if (!player) {
        bot.chat(`Usage: ${CFG.prefix}follow <player>`)
        return
      }
      stopTasks()
      pushTask({ type: 'follow', player, distance: 3, everyMs: 700 })
      bot.chat(`👣 Following ${player}`)
      return
    }

    if (cmd === 'rc') {
      stopTasks()
      pushTask({ type: 'rightClickItem', everyMs: 250, times: 0 })
      bot.chat('🖱️ Right-click ITEM loop ON.')
      return
    }

    if (cmd === 'rcblock') {
      const [x, y, z] = args
      if ([x, y, z].some(v => v === undefined)) {
        bot.chat(`Usage: ${CFG.prefix}rcblock <x> <y> <z>`)
        return
      }
      stopTasks()
      pushTask({ type: 'rightClickBlock', x: Number(x), y: Number(y), z: Number(z), everyMs: 500, times: 0 })
      bot.chat(`🖱️ Right-clicking BLOCK at ${x} ${y} ${z}`)
      return
    }

    if (cmd === 'lc' || cmd === 'attack') {
      stopTasks()
      pushTask({ type: 'attackLoop', everyMs: CFG.attackEveryMs })
      bot.chat('⚔️ Attack loop ON (safe target).')
      return
    }

    if (cmd === 'attackcfg') {
      bot.chat(`⚙️ attackRange=${CFG.attackRange} fovDot=${CFG.attackFovDot} everyMs=${CFG.attackEveryMs} types=${CFG.attackTypes.join(',')}`)
      return
    }

    bot.chat(`Unknown command. Use ${CFG.prefix}help`)
  } catch (e) {
    bot.chat('Command error: ' + (e?.message || e))
  }
}

/* ===================== START ===================== */
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

  bot.once('spawn', () => {
    console.log('✅ Bot joined the server!')

    const mcData = require('minecraft-data')(bot.version)
    bot.pathfinder.setMovements(new Movements(bot, mcData))

    bot.on('chat', onChat)

    // Resume tasks
    runLoop().catch(err => console.log('⚠️ runLoop error:', err))
  })

  bot.on('kicked', r => console.log('⛔ Kicked:', r))
  bot.on('error', e => console.log('⚠️ Error:', e?.message || e))

  bot.on('end', () => {
    console.log('🔌 Disconnected.')
    stopAllIntervals()

    if (CFG.exitOnDisconnect) {
      process.exit(1)
    } else {
      // If you ever want internal reconnect, you can implement backoff here
      process.exit(1)
    }
  })
}

startBot()
