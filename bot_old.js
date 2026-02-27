const mineflayer = require('mineflayer')

const bot = mineflayer.createBot({
  host: 'server.colorminding.de',
  port: 25565,
  username: 'TRy2LuvMe',
  auth: 'microsoft',
  version: '1.21.11'
})

bot.on('spawn', () => {
  console.log('✅ Bot joined the server!')
})

bot.on('end', () => {
  console.log('Disconnected. Reconnecting...')
  setTimeout(() => process.exit(1), 5000)
})
