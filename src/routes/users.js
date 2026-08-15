const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../authMiddleware');
const bcrypt = require('bcryptjs');
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;     //이후 .env에 보관
if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET 환경변수가 설정되지 않았습니다.");
}
const JWT_OPTIONS = {
    expiresIn: '1h'
}
//=======================================================
//1. 회원가입

router.post("/users/signup", async (req, res) => {
    try{
        const { email, username, name, password } = req.body;
        const userInfo = { email, username, name, password };
        for (const [key, value] of Object.entries(userInfo)){
            if (!value) {
                res.status(400).json({
                    "message": `${key}정보가 누락되었습니다.`
                });
                return;
            }
            //필수 정보 모두 입력되었는지 확인하기

        }

        const [[{ isEmail }]] = await pool.query(`SELECT EXISTS (SELECT 1 FROM users WHERE email = ?) AS isEmail`, [email])
        if (isEmail){
            res.status(409).json({
                "message": "이미 존재하는 이메일 주소입니다."
            });
            return;
        }
        //이미 존재하는 email인지 검사하기

        const [[{ isUsername }]] = await pool.query(`SELECT EXISTS (SELECT 1 FROM users WHERE username = ?) AS isUsername`, [username])
        if (isUsername){
            res.status(409).json({
                "message": "이미 존재하는 사용자 아이디입니다."
            });
            return;
        }
        //이미 존재하는 username인지 검사하기


        const hashedPassword = await bcrypt.hash(password, 10)      //비밀번호 암호화(saltRounds: 10)
        const [registerResult] = await pool.query(`
            INSERT INTO users (email, username, name, password, created_at, is_private) 
            VALUES (?, ?, ?, ?, NOW(), FALSE)`, [email, username, name, hashedPassword]);
            //회원 가입 정보 DB 입력

        if (registerResult.affectedRows === 1) {
            const [[newUser]] = await pool.query(`
                SELECT user_id, email, username, name, created_at, profile_image_url 
                FROM users WHERE username = ?`, [username]);
                //username으로 가입한 사용자 검색해 newUser로 가져오기
            

            const payload = {
                userId: newUser.user_id
            };
            const accessToken = jwt.sign(payload, JWT_SECRET, JWT_OPTIONS);
            //payload 설정 및 accessToken 발급

            res.status(201).json({
                "message": "회원가입 성공",
                "createdAt": newUser.created_at,
                "token": {
                    "accessToken": accessToken,
                    //"refreshToken": refreshToken
                },
                "user": {
                    "userId": newUser.user_id,
                    "email": newUser.email,
                    "username": newUser.username,
                    "name": newUser.name,
                    "profileImageUrl": null
                }
            });
        }
    } catch(error){
        console.error(error);
        res.status(500).json({"message": "서버 에러가 발생했습니다."});
    }
})


//=======================================================
//2. 로그인 기능

router.post("/users/login", async (req, res) => {
    try{
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                "message": "사용자 아이디와 비밀번호를 모두 입력해주세요"
            });
        }
        //username, password 모두 입력되었는지 확인

        const [[user]] = await pool.query(`
            SELECT * FROM users WHERE username = ?`, [username]);
        if (!user) {
            return res.status(401).json({
                "message": "사용자 아이디 또는 비밀번호가 일치하지 않습니다."
            });
        }
        //해당 username을 갖는 행 검색

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                "message": "사용자 아이디 또는 비밀번호가 일치하지 않습니다."
            });

        }
        //DB와 비밀번호 대조 - 비밀번호가 틀린 경우


        console.log("DB에서 가져온 user_id: ", user.user_id); //디버깅용
        const payload = {
            userId: user.user_id
        };
        const accessToken = jwt.sign(payload, JWT_SECRET, JWT_OPTIONS)
        //payload 설정 및 엑세스 토큰 발급

        return res.status(200).json({
            "message": "로그인 성공",
            "token": {
                "accessToken": accessToken,
                //"refreshToken": refreshToken                
            },
            "user": {
                "userId": user.user_id,
                "email": user.email,
                "username": user.username,
                "name": user.name,
                "profileImageUrl": user.profile_image_url
            }
        });
        //비밀번호가 맞는 경우

        
    } catch (error) {
        console.error(error);
        return res.status(500).json({"message": "서버 에러가 발생했습니다."});
    }
})


//=======================================================
//3. 내 프로필 조회

router.get("/users/me", authenticateToken, async (req, res) => {
    try{
        const userId = req.user.userId;
        console.log(req.user.userId);
        

        const [[user]] = await pool.query(`
            SELECT user_id, email, username, name, birth_date, bio, location, profile_image_url, banner_image_url, is_private, created_at
            FROM users WHERE user_id = ?`, [userId]);
        //토큰의 user_id 갖는 사용자 정보 가져오기
        
        if (!user) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }
        
        const [[ {followingCount }]] = await pool.query(`
            SELECT COUNT(*) AS followingCount FROM follows WHERE follower_id = ?`, [userId]);
        //팔로잉 수 세기

        const [[{ followerCount }]] = await pool.query(`
            SELECT COUNT(*) AS followerCount FROM follows WHERE following_id = ?`, [userId]);
        //팔로워 수 세기
            

        return res.status(200).json({
            "user": {
                "userId": userId,
                "email": user.email,
                "username": user.username,
                "name": user.name,
                "birthDate": user.birth_date,
                "bio": user.bio,
                "location": user.location,
                "profileImageUrl": user.profile_image_url,
                "bannerImageUrl": user.banner_image_url,
                "followingCount": followingCount,
                "followerCount": followerCount,
                "isPrivate": user.is_private,
                "createdAt": user.created_at
            }
        });

    }catch(error){
        console.error(error);
        res.status(500).json({
            "message": "서버 에러가 발생했습니다."
        })
    }
})

//=======================================================
//4. 내 프로필 수정

router.patch("/users/me", authenticateToken, async(req, res) => {
    try{
        const userId = req.user.userId;
        const { bio, location, profileImageUrl, bannerImageUrl, name, birthDate } = req.body;

        const [[user]] = await pool.query(`
            SELECT user_id FROM users WHERE user_id = ?`, [userId]);
        //토큰의 user_id 갖는 사용자 정보 가져오기
        
        if (!user) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }

        const fields = [];
        const value = [];
        //업데이트할 칼럼들과 바인딩할 값을 담을 배열
        
        if(bio !== undefined){
            fields.push("bio = ?");
            value.push(bio);
        }
        if(location !== undefined){
            fields.push("location = ?");
            value.push(location);
        }
        if(profileImageUrl !== undefined){
            fields.push("profile_image_url = ?");
            value.push(profileImageUrl);
        }
        if(bannerImageUrl !== undefined){
            fields.push("banner_image_url = ?");
            value.push(bannerImageUrl);
        }
        if(name !== undefined){
            fields.push("name = ?");
            value.push(name);
        }
        if(birthDate !== undefined){
            fields.push("birth_date = ?");
            value.push(birthDate);
        }
        //수정사항이 있다면(undefined가 아니라면) 필드명과 값을 각각 리스트에 추가


        if (fields.length === 0){
            return res.status(200).json({
                "message": "수정사항이 없습니다."
            });
        }

        value.push(userId); //WHERE 에 사용하기 위해 추가
        const sql = `UPDATE users SET ${fields.join(', ')} WHERE user_id = ?`
        await pool.query(sql, value);
        //field에 있는 값

        const [[user]] = await pool.query(`
            SELECT * FROM users WHERE user_id = ?`, [userId]);


        return res.status(200).json({
            "message": "프로필 수정 성공",

            "user": {
                "userId": userId,
                "email": user.email,
                "username": user.username,
                "name": user.name,
                "birthDate": user.birth_date,
                "bio": user.bio,
                "location": user.location,
                "profileImageUrl": user.profile_image_url,
                "bannerImageUrl": user.banner_image_url,
                "isPrivate": user.is_private,
                "createdAt": user.created_at
            }
        });
        //수정된 프로필 반환

    } catch(error){
        console.error(error);
        return res.status(500).json({
            "message": "서버 에러가 발생했습니다."
        });
    }
})




//=======================================================
//5. 다른 사용자 프로필 조회

router.get("/users/:userId", authenticateToken, async (req, res) => {
    try{
        const myId = req.user.userId;
        const userId = req.params.userId;
        console.log(req.params.userId);
        

        const [[user]] = await pool.query(`
            SELECT user_id, email, username, name, birth_date, bio, location, profile_image_url, banner_image_url, is_private, created_at
            FROM users WHERE user_id = ?`, [userId]);
        //토큰의 user_id 갖는 사용자 정보 가져오기
        
        if (!user) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }
        
        const [[ {followingCount }]] = await pool.query(`
            SELECT COUNT(*) AS followingCount FROM follows WHERE follower_id = ?`, [userId]);
        //팔로잉 수 세기

        const [[{ followerCount }]] = await pool.query(`
            SELECT COUNT(*) AS followerCount FROM follows WHERE following_id = ?`, [userId]);
        //팔로워 수 세기


        //const [[{ isFollower }]] = await pool.query(`SELECT EXISTS (
            //SELECT 1 FROM follows WHERE following_id = ? AND follower_id = ?) AS isFollower`, [userId, myId]);
        
        return res.status(200).json({
            "user": {
                "userId": userId,
                "username": user.username,
                "name": user.name,
                "bio": user.bio,
                "location": user.location,
                "profileImageUrl": user.profile_image_url,
                "bannerImageUrl": user.banner_image_url,
                "followingCount": followingCount,
                "followerCount": followerCount,
                "isPrivate": user.is_private,
                "createdAt": user.created_at
            }//birthDate, email 제외됨
        });
        

    }catch(error){
        console.error(error);
        res.status(500).json({
            "message": "서버 에러가 발생했습니다."
        });
    }
})



//=======================================================
//6. 다른 사용자 검색


router.get("/users", async(req, res) => {
    try{
        const { keyword } = req.query;
        console.log(`검색어: ${keyword}`);

        if (!keyword) {
            return res.status(400).json({
                "message": "검색어가 없습니다"
            });
        }

        const [users] = await pool.query(`
            SELECT user_id, username, name FROM users 
            WHERE username LIKE ? OR name LIKE ?`, [`%${keyword}%`, `%${keyword}%`]);
        //username이나 name에 키워드가 포함된 경우 가져오기
        
        return res.status(200).json({
            "totalCount": users.length,
            "users": users
        });

    } catch(error){
        console.error(error);
        res.status(500).json({
            "message": "서버 에러가 발생했습니다."
        });
    }
})




//=======================================================
//7. 계정 공개 설정

router.patch("/users/me/privacy", authenticateToken, async (req, res) => {
    try{
        const userId = req.user.userId;
        const newPrivacy = req.body.isPrivate;

        const [[user]] = await pool.query(`
            SELECT user_id
            FROM users WHERE user_id = ?`, [userId]);
        //토큰의 user_id 갖는 사용자 정보 가져오기
        
        if (!user) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }
        
        await pool.query(`
            UPDATE users SET is_private = ? WHERE user_id = ?`, [newPrivacy, userId]);
        //body로 받은대로 계정 공개 설정하기

        return res.status(200).json({
            "message": "계정 공개 설정 완료",
            "isPrivate": newPrivacy
        });
    }
    catch(error){
        console.error(error);
        return res.status(500).json({
            "message": "서버 에러가 발생했습니다."
        });
    }
})



//=======================================================
//8. 비밀번호 변경

router.patch("/users/me/settings/password", authenticateToken, async (req, res) => {
    try{
        const userId = req.user.userId;
        const newPassword = req.body.newPassword;

        const [[user]] = await pool.query(`
            SELECT user_id FROM users WHERE user_id = ?`, [userId]);
        //토큰의 user_id 갖는 사용자 정보 가져오기
        
        if (!user) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 10)      //비밀번호 암호화(saltRounds: 10)
        await pool.query(`
            UPDATE users SET password = ? WHERE user_id = ?`, [hashedNewPassword, userId]);
        //비밀번호 수정

        const payload = {
            userId: userId
        };
        const accessToken = jwt.sign(payload, JWT_SECRET, JWT_OPTIONS);
        //토큰 발급하기


        return res.status(200).json({
            "message": "비밀번호가 변경되었습니다.",
            "token": {
                "accessToken": accessToken,
                //"refreshToken": refreshToken
            }
        });

    }   
    catch(error){
        console.error(error)
        return res.status(500).json({
            "message": "서버 에러가 발생했습니다."
        })
    }
})



//=======================================================
//9. 이메일 변경

router.patch("/users/me/settings/email", authenticateToken, async (req, res) => {
    try{
        const userId = req.user.userId;
        const newEmail = req.body.newEmail;

        const [[user]] = await pool.query(`
            SELECT user_id FROM users WHERE user_id = ?`, [userId]);
        //토큰의 user_id 갖는 사용자 정보 가져오기
        
        if (!user) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }

        const [[{ isEmail }]] = await pool.query(`SELECT EXISTS (SELECT 1 FROM users WHERE email = ?) AS isEmail`, [newEmail])
        if (isEmail){
            return res.status(409).json({
                "message": "이미 존재하는 이메일 주소입니다."
            });
        }
        //이메일 중복 검사
        
        await pool.query(`
            UPDATE users SET email = ? WHERE user_id = ?`, [newEmail, userId]);
        //body로 받은대로 이메일 설정하기

        return res.status(200).json({
            "message": "이메일이 변경되었습니다.",
            "email": newEmail
        });
    }
    catch(error){
        console.error(error);
        return res.status(500).json({
            "message": "서버 에러가 발생했습니다."
        });
    }
})


//=======================================================
//10. 유저네임 변경

router.patch("/users/me/settings/username", authenticateToken, async (req, res) => {
    try{
        const userId = req.user.userId;
        const newUsername = req.body.newUsername;

        const [[user]] = await pool.query(`
            SELECT user_id FROM users WHERE user_id = ?`, [userId]);
        //토큰의 user_id 갖는 사용자 정보 가져오기
        
        if (!user) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }

        const [[{ isUsername }]] = await pool.query(`SELECT EXISTS (SELECT 1 FROM users WHERE username = ?) AS isUsername`, [newUsername])
        if (isUsername){
            return res.status(409).json({
                "message": "이미 존재하는 사용자 아이디입니다."
            });
        }
        //유저네임 중복 검사
        
        await pool.query(`
            UPDATE users SET username = ? WHERE user_id = ?`, [newUsername, userId]);
        //body로 받은대로 유저네임 설정하기

        return res.status(200).json({
            "message": "사용자 아이디가 변경되었습니다.",
            "username": newUsername
        });
    }
    catch(error){
        console.error(error);
        return res.status(500).json({
            "message": "서버 에러가 발생했습니다."
        });
    }
})



//=======================================================
//19. 비밀번호 검증

router.post("/users/me/settings/verification", authenticateToken, async (req, res) => {
    try{
        const userId = req.user.userId;
        const password = req.body.password;


        if(!password){
            return res.status(400).json({
                "message": "비밀번호를 입력해주세요."
            })
        }

        const [[user]] = await pool.query(`
            SELECT user_id, password FROM users WHERE user_id = ?`, [userId]);
        //토큰의 user_id 갖는 사용자 정보 가져오기
        
        if (!user) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                "message": "비밀번호가 일치하지 않습니다.",
                "isValid": false
            });
        }
        //비밀번호 검증 - 틀린 경우

        return res.status(200).json({
            "message": "비밀번호가 검증되었습니다.",
            "isValid": true
        })
        
    }
    catch(error){
        console.error(error);
        return res.status(500).json({
            "message": "서버 에러가 발생했습니다."
        });
    }
})


module.exports = router;