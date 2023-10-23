import express from "express";
import logger from "morgan";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

import { Server } from "socket.io";
import { createServer } from "node:http";

dotenv.config();
const port = process.env.PORT ?? 3000;
const app = express();

//1.creamos el server http
const server = createServer(app);
//2.creamos el socket
const io = new Server(server, {
  connectionStateRecovery: {},
});
//5. creamos la conexion con la base de datos
const db = createClient({
  url: "libsql://current-supergran-laucadi.turso.io",
  authToken: process.env.DB_TOKEN,
});

//6. creamos la tabla de mensajes
await db.execute(`
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  user TEXT
)
`);
//3.escuchamos el evento de conexion
io.on("connection", async (socket) => {
  console.log("a user connected");
  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
  socket.on("chat message", async (msg) => {
    let result;
    const username = socket.handshake.auth.username ?? "anonymous";
    try {
      result = await db.execute({
        sql: `INSERT INTO messages(content,user) VALUES (:msg, :username)`,
        args: { msg, username },
      });
    } catch (error) {
      console.error(error);
      return;
    }
    //4. la diferencia entre io y socket es que io es global y socket es para cada cliente
    io.emit("chat message", msg, result.lastInsertRowid.toString(), username);
  });
  //7.recuperamos los mensajes de la base de datos cuando no habia conexion
  if (!socket.recovered) {
    try {
      const results = await db.execute({
        sql: "SELECT id, content, user FROM messages WHERE id >?",
        args: [socket.handshake.auth.serverOffset ?? 0],
      });
      results.rows.forEach((row) => {
        socket.emit("chat message", row.content, row.id.toString(), row.user);
      });
    } catch (error) {
      console.error(error);
      return;
    }
  }
});

app.use(logger("dev"));

app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/client/index.html");
});

server.listen(port, () => {
  console.log(`server running on port ${port}`);
});
