/**
 * Minecraft Bot using minecraft-protocol + prismarine-auth
 * Holds rightclick continuously and leftclick every 1.6 seconds
 * Microsoft account authentication
 * 
 * ENV:
 * MC_HOST, MC_PORT, MC_VERSION, MC_USER (email), PROFILES_DIR
 */
require('dotenv').config()
const mc = require('minecraft-protocol')
const { Authflow } = require('prismarine-auth')
const fs = require('fs')
const path = require('path')

const CFG = {
  host: process.env.MC_HOST || 'server.colorminding.de',
  port: Number(process.env.MC_PORT || 25566),
  version: process.env.MC_VERSION || '1.21.1',
  email: process.env.MC_USER || 'test@example.com',
  profilesDir: process.env.PROFILES_DIR || './profiles'
}

let client = null
let rightClickInterval = null
let leftClickInterval = null

async function startBot () {
  console.log('🟦 Authenticating with Microsoft…')

  try {
    // Ensure profiles directory exists
    if (!fs.existsSync(CFG.profilesDir)) {
      fs.mkdirSync(CFG.profilesDir, { recursive: true })
    }

    // Create authflow for Microsoft login
    const authflow = new Authflow(CFG.email, CFG.profilesDir)
    const { accessToken, selectedProfile } = await authflow.getAccessToken()

    console.log(`✅ Authenticated as ${selectedProfile.name}`)

    client = mc.createClient({
      host: CFG.host,
      port: CFG.port,
      version: CFG.version,
      username: selectedProfile.name,
      auth: 'microsoft',
      accessToken: accessToken,
      profile: selectedProfile
    })

    client.on('login', () => {
      console.log('✅ Bot joined server.')
      startClicking()
    })

    client.on('error', (err) => {
      console.log('⚠️ Connection Error:', err.message)
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
      console.log('📴 Server closed connection:', packet.reason)
    })
  } catch (err) {
    console.log('❌ Authentication failed:', err.message)
    process.exit(1)
  }
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
  }, 1600)

  console.log('🎮 Bot started: holding rightclick (offhand), leftclick every 1.6s (mainhand)')
}

startBot()

