let OofServer = require("./src/OofServer")

new OofServer({
  port: process.env.OOFPORT || "8081"
})
