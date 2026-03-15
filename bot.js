/**
 * Minecraft Bot using minecraft-protocol
 * Holds rightclick continuously and leftclick every 1.6 seconds
 * 
 * ENV:
 * MC_HOST, MC_PORT, MC_VERSION, MC_USER, MC_AUTH
 */
require('dotenv').config()
const mc = require('minecraft-protocol')

const CFG = {
  host: process.env.MC_HOST || 'server.colorminding.de',
  port: Number(process.env.MC_PORT || 25566),
  version: process.env.MC_VERSION || '1.21.10',
  username: process.env.MC_USER || 'email@example.com',
  auth: process.env.MC_AUTH || 'offline'
}

let client = null
let rightClickInterval = null
let leftClickInterval = null

function startBot () {
  console.log('🟦 Connecting to bot…')

  client = mc.createClient({
    host: CFG.host,
    port: CFG.port,
    version: CFG.version,
    username: CFG.username,
    auth: CFG.auth === 'offline' ? 'offline' : 'microsoft'
  })

  client.on('login', () => {
    console.log('✅ Bot joined.')
    startClicking()
  })

  client.on('error', (err) => {
    console.log('⚠️ Error:', err.message)
    console.log('⚠️ Full error:', err)
  })

  client.on('end', () => {
    console.log('🔌 Disconnected.')
    if (rightClickInterval) clearInterval(rightClickInterval)
    if (leftClickInterval) clearInterval(leftClickInterval)
    process.exit(0)
  })

  client.on('kick_disconnect', (reason) => {
    console.log('⛔ Kicked:', reason)
  })

  client.on('disconnect', (packet) => {
    console.log('📴 Disconnect packet:', packet.reason)
  })
}

function startClicking () {
  if (rightClickInterval) clearInterval(rightClickInterval)
  if (leftClickInterval) clearInterval(leftClickInterval)

  // Hold rightclick continuously (every 50ms) - send block place packet
  rightClickInterval = setInterval(() => {
    try {
      client.write('block_place', {
        location: { x: 0, y: 0, z: 0 },
        direction: 0,
        hand: 1
      })
    } catch (e) {}
  }, 50)

  // Leftclick every 1.6 seconds - send arm animation packet
  leftClickInterval = setInterval(() => {
    try {
      client.write('arm_animation', {
        hand: 0
      })
    } catch (e) {}
  }, 550)

  console.log('🎮 Bot started: holding rightclick, leftclick every 1.6s')
}

startBot()

