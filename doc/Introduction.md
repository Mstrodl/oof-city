# Oof-city
Welcome to Oof City! Oof City is very simple to communicate with and uses websockets to communicate in a similar fashion to Discord.

## Setup
Oof City is rather easy to set up:

1. First, you need to download oof-city and install the dependencies:

```
# Clone the repo
git clone https://github.com/Mstrodl/oof-city.git
# Install dependencies
npm i
```

2. Then, just start up the Oof City server:

```
# Start the server
node app.js
```

3. Profit?

## Events
All events (incoming and outgoing) are formatted like this:

```json
{
  "op": "play",
  "d": {
    "track": {
      "url": "https://youtube.com/watch?v="
    },
    "guildId": "",
    "channelId": ""
  }
}
```

All events have a `guildId` and `channelId` in the `d` property. The `op` refers to the operation which is to be performed by the reciever of the event. By default, the port is 8081 but can be changed with the environment variable `OOFPORT`.