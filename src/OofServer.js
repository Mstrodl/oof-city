let Websocket = require("ws")
let os = require("os")
let OofPlayer = require("./OofPlayer")

/**
 * Represents an Oof City server. Multiple can run in one process.
 * @arg {Object} [opts] Options to initialize the Oof City server with.
 * @arg {String=8081} [opts.port] Port the Oof City server will listen on
 * @prop {Object} guilds Guilds the Oof City server is serving
 * @prop {Websocket.Server} wss Websocket server that is handling incoming connections to the Oof City server
 */
module.exports = class OofServer {
  constructor(opts) {
    this.guilds = {}
    this.wss = new Websocket.Server({
      port: opts.port || "8081"
    })
    this.wss.on("connection", ws => {
      ws.isAlive = true
      ws.on("pong", () => ws.isAlive = true)
      ws.on("close", () => clearInterval(statsInterval))
      ws.on("message", msg => this.onMessage(msg, ws))
      let statsInterval = setInterval(() => {
        if(!ws.isAlive) return ws.terminate()
        ws.isAlive = false
        ws.ping("", false, false)
        if(ws.readyState == 3) return console.log("WS is dead")
        ws.send(JSON.stringify({
          op: "stats",
          d: {
            cores: os.cpus().length,
            load: os.loadavg()[0]
          }
        }))
      }, 30000)
    })
  }
  /**
   * Joins a voice channel
   * @private
   * @arg {String} channelId ID of the voice channel to connect to 
   * @arg {String} guildId ID of the guild the voice channel is in
   * @arg {String} userId ID of the bot to connect as
   * @arg {Websocket} ws Websocket client who requested it
   */
  joinChannel(channelId, guildId, userId, ws) {
    console.log("Joining channel", channelId, guildId)
    this.guilds[guildId] = new OofPlayer({
      guildId: guildId,
      channelId: channelId,
      ws: ws,
      userId: userId
    })
  }

  /**
   * Handles a websocket event
   * @private
   * @arg {*} data The websocket event recieved
   * @arg {Websocket} ws The client who made the event
   */
  onMessage(data, ws) {
    let message = JSON.parse(data)
    console.log(`Got message from shard ${data}`)
    let player = this.guilds[message.d.guildId]
    switch(message.op) {
    case "join": {
      this.joinChannel(message.d.channelId, message.d.guildId, message.d.userId, ws)
      break
    }
    case "play": {
      if(!player) throw "No voice connection but play command called"
      player.playArbitraryTrack(message.d.track)
      break
    }
    case "stop": {
      if(!player) throw "No voice connection but stop command called"
      player.stop()
      break
    }
    case "leave": {
      if(!player) throw "No voice connection but leave command called"
      player.disconnect()
      delete this.guilds[data.guildId]
      break
    }
    case "seek": {
      if(!player) throw "No voice connection but seek command called"
      player.seek(message.d.position)
      break
    }
    case "voiceServerUpdate": {
      if(!player) throw "No voice connection but voiceServerUpdate command called"
      player.serverUpdate(message.d)
      break
    }
    case "voiceStateUpdate": {
      if(!player) throw "No voice connection but voiceStateUpdate command called"
      player.stateUpdate(message.d)
      break
    }
    case "volume": {
      if(!player) throw "No voice connection but volume command called"
      player.volume(message.d.volume)
    }
    case "pause": {
      if(!player) throw "No voice connection but pause command called"
      player.pause(message.d.pause)
    }
    }
  }
}
