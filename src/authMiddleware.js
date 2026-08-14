const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "secret_key";

const authenticateToken = (req, res, next) => {
    //"Bearer <토큰문자열>" 형태의 Authorization 헤더 가져오기
    const authHeader = req.headers['authorization'];

    //토큰 문자열만 남기기
    const token = authHeader && authHeader.split(' ')[1];

    //토큰 존재 검사
    if (!token) {
        return res.status(401).json({
            "message": "토큰이 제공되지 않았습니다."
        });
    }

    //토큰 위조/만료 검사
    jwt.verify(token, JWT_SECRET, (error, decoded) => {
        if (error) {
            return res.status(401).json({
                "message": "유효하지 않거나 만료된 토큰입니다."
            });
        }

        console.log("decoded 결과: ", decoded);
        //decoded에는 payload 내용 +a 가 들어있음
        req.user = decoded;

        next(); //다음 라우터로

    });
    
};

module.exports = authenticateToken;