let Eris = require("eris")
let Constants = Eris.Constants
let VoiceConnection = Eris.VoiceConnection
let Websocket = require("ws")
let ytdl = require("youtube-dl")

/**
 * Represents a voice channel's player
 * @arg {Object} [opts] Options to create the OofPlayer with
 * @arg {String} [opts.guildId] ID of the guild this OofPlayer is for
 * @arg {String} [opts.channelId] ID of the voice channel this OofPlayer is playing tracks in
 * @arg {Websocket} [opts.ws] Websocket client this OofPlayer is for
 * @arg {String} [opts.userId] ID of the bot this client is for
 * @arg {OofServer} server Server that created this OofPlayer
 * @prop {OofServer} server Server that created this OofPlayer
 * @prop {String} guildId ID of the guild this OofPlayer is playing music in
 * @prop {String} channelId ID of the channel this OofPlayer is playing music in
 * @prop {Websocket} ws Websocket of the client that requested this OofPlayer
 * @prop {String} userId ID of the bot the OofPlayer is connecting as
 * @prop {VoiceConnection} connection The connection to the voice channel
 * @prop {Boolean} ready Whether or not the OofPlayer's VoiceConnection is ready to transmit audio
 * @prop {Boolean} authed Whether or not the OofPlayer's VoiceConnection has authenticated to the voice WS
 */
module.exports = class OofPlayer {
  constructor(opts, server) {
    this.server = server
    this.guildId = opts.guildId
    this.channelId = opts.channelId
    this.ws = opts.ws
    this.userId = opts.userId
    this.connection = new VoiceConnection(this.guildId, {
      shard: {
        sendWS: (op, data) => {
          this.send({
            op: "sendWS",
            d: {
              op: op,
              d: data
            }
          })
        },
        client: {
          options: {
            connectionTimeout: 30000
          }
        }
      }
    })
    this.connection.switchChannel(this.channelId)
    this.ready = false
    this.authed = false
    this.connection.on("connect", () => console.log("Connected to channel"))
    this.connection.on("authenticated", this.onAuthed.bind(this))
    this.connection.on("debug", message => console.log(message))
    this.connection.on("disconnect", this.onDisconnect.bind(this))
    this.connection.on("error", this.onError.bind(this))
    this.connection.on("failed", this.onError.bind(this))
    this.connection.on("reconnecting", this.onReconnecting.bind(this))
    this.connection.on("warn", message => console.warn(message))
    this.connection.on("ready", this.onReady.bind(this))
  }

  /**
   * Called on reconnect (not tested)
   * @private
   */
  onReconnecting() {
    console.info("Reconnecting due to region change...")
  }

  /**
   * Called on error
   * @private
   */
  onError(err) {
    console.warn(`Encountered an error in channel ${this.channelId}: ${err}`)
  }

  /**
   * Called when the server successfully authenticates to the voice gateway
   * @private
   */
  onAuthed() {
    this.authed = true
    console.info(`Authenticated to channel ${this.channelId}`)
  }

  /**
   * Called when the server connects to the voice channel and is ready to be used
   * @private
   */
  onReady() {
    console.info("Connected!")
    this.ready = true
    this.send({
      op: "connected",
      d: {
        channelId: this.channelId,
        guildId: this.guildId
      }
    })
  }

  /**
   * Called when we disconnect
   * @private
   */
  onDisconnect() {
    this.ready = false
    console.info(`Disconnected from channel ${this.channelId}`)
    this.send({
      op: "disconnected",
      d: {
        channelId: this.channelId,
        guildId: this.guildId
      }
    })
  }

  /**
   * Called when we get a forwarded voiceServerUpdate packet. Sets voice token and voice WS endpoint
   * @arg {*} data voiceServerUpdate packet forwarded from Discord
   * @private
   */
  serverUpdate(data) {
    console.log("Got serverUpdate", data)
    this.token = data.token
    this.endpoint = data.endpoint
    this.connect()
  }

  /**
   * Called when we get a forwarded voiceStateUpdate. Sets the voice session id
   * @arg {*} data voiceStateUpdate packet forwarded from Discord
   * @private
   */
  stateUpdate(data) {
    console.log("Got stateUpdate", data)
    this.session_id = data.session_id
    this.connect()
  }

  /**
   * Attempts to connect to the voice gateway
   * @private
   */
  connect() {
    if(!this.session_id || !this.endpoint || !this.token || !this.userId) return console.log("Missing item on connect() list")
    console.log("Connecting!")
    this.connection.connect({
      session_id: this.session_id,
      endpoint: this.endpoint,
      token: this.token,
      user_id: this.userId,
      channel_id: this.channelId
    })
  }

  /**
   * Sends a websocket event to the client assigned to this OofPlayer
   * @private
   * @arg {*} data The websocket event to be sent
   */
  send(data) {
    if(this.ws.readyState == 3) {
      console.log("WS Closed... Ignoring WS send request")
      this.ws.terminate()
      this.emit("disconnected")
      return
    }
    this.ws.send(JSON.stringify(data))
  }

  /**
   * Plays an arbitrary track. Called by the play websocket event
   * @private
   * @arg {Object} [track] The track to be played
   * @arg {String} [track.url] The URL of the track to be played
   * @arg {Object={}} [opts] Options to initialize the track with
   * @arg {String=} [opts.startTime] Time to start playback of the track at
   * @arg {String=} [opts.endTime] Time to end playback of the track at
   */
  playArbitraryTrack(track, opts = {}) {
    let stream = ytdl(track.url, ["--format", "bestaudio", "--default-search", "ytsearch:"])
    stream.on("info", info => {
      // Notify the client that the download started...
      this.send({
        op: "trackInfo",
        d: {
          info,
          guildId: this.guildId,
          channelId: this.channelId
        }
      })
    })

    let inputArgs = []
    let encoderArgs = []
    if(opts.startTime) {
      inputArgs.push("-ss", opts.startTime)
    }
    if(opts.endTime) {
      encoderArgs.push("-to", opts.endTime)
    }
    
    this.connection.play(stream, {
      inlineVolume: true,
      encoderArgs: encoderArgs,
      inputArgs: inputArgs
    })

    this.connection.once("end", () => {
      this.send({
        op: "trackEnd",
        d: {
          guildId: this.guildId,
          channelId: this.channelId
        }
      })
    })
  }

  /**
   * Called when the stop websocket event is recieved.
   * @private
   */
  stop() {
    this.connection.stopPlaying()
  }

  /**
   * Called when the disconnect websocket event is recieved. Disconnects from the voice channel
   * @private
   */
  disconnect() {
    this.connection.disconnect()
  }

  /**
   * Seeks to another position in the current track. Called when the seek websocket event is recieved. Not implemented
   * @private
   * @arg {String} position The position to seek to
   */
  seek(position) {
    throw "Stub method... Not implemented"
  }

  /**
   * Sets the volume of the currently playing track. Called when the volume websocket event is recieved.
   * @private
   * @arg {String|Number} volume The volume change to be applied
   */
  volume(volume) {
    this.connection.setVolume(Number(volume))
  }

  /**
   * (Un)pauses the currently playing track. Called when the volume websocket event is recieved
   * @arg {undefined|Boolean} pause If set to true or false, attempts to set the paused state to paused if true, or resumed if false, if not set, toggles.
   * @private
   */
  pause(pause) {
    if(pause !== true && pause !== false) {
      if(this.connection.paused) this.connection.resume()
      else this.connection.pause()
    } else {
      if(pause && !this.connection.paused) this.connection.pause()
      else if(!pause && this.connection.paused) this.connection.resume()
    }
  }
}
