const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../.env")
});

const express = require("express");
const pool = require("./config/db");
const postsRouter = require("./routes/posts");
const relationRouter = require("./routes/relation");
const usersRouter = require("./routes/users");
const listsRouter = require("./routes/lists")

const app = express();
const PORT = process.env.PORT || 3000;
/*
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));
*/

app.use(express.json());
app.use("/posts", postsRouter);
app.use("/", relationRouter);
app.use("/", usersRouter);
app.use("/", listsRouter);

app.get("/", (req, res) => {
  res.status(200).json({
    message: "X 클론 백엔드 서버가 실행 중입니다."
  });
});

app.get("/db-test", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS result");

    res.status(200).json({
      message: "MySQL 연결 성공",
      result: rows[0].result
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "MySQL 연결 실패"
    });
  }
});

app.get("/tables", async (req, res) => {
  try {
    const [rows] = await pool.query("SHOW TABLES");
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "테이블 조회 실패" });
  }
});



app.listen(PORT, () => {
  console.log(`서버 실행: http://localhost:${PORT}`);
});