const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../.env")
});

const express = require("express");
const pool = require("./config/db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`서버 실행: http://localhost:${PORT}`);
});