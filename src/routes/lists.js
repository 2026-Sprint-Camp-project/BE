const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../authMiddleware');

//=======================================================
//11. 리스트 생성

router.post("/users/me/lists", authenticateToken, async (req, res) => {
    try{
        const userId = req.user.userId;
        const { listName, description, isPrivate } = req.body;
        const requrirements = { listName, isPrivate };

        if(!userId) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }

        const [rows] = await pool.query(`
            SELECT user_id FROM users WHERE user_id = ?`, [userId]);
        const user = rows[0]

        if(!rows || rows.length === 0) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }
        //사용자 존재하는지 검사

        
        if(!listName) {
            return res.status(400).json({
                "message": "리스트 이름을 입력해주세요"
            });
        }
        //필수 정보 listName 검사

        if(isPrivate === undefined || isPrivate ===null || isPrivate === ""){
            return res.status(400).json({
                "message": "리스트 공개 여부를 설정해주세요."
            });
        }

        const [result] = await pool.query(`
            INSERT INTO lists (user_id, list_name, description, is_private, created_at)
            VALUES (?, ?, ?, ?, NOW())`, [userId, listName, description, isPrivate]);
        //리스트 추가하기


        return res.status(201).json ({
            "list": {
                "listId": result.insertId,
                "userId": userId, 
                "listName": listName,
                "description": description,
                "isPrivate": isPrivate
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
//12. 내 리스트 조회

router.get("/users/me/lists", authenticateToken, async (req, res) => {
    try{
        const userId = req.user.userId;

        if(!userId) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }

        const [rows] = await pool.query(`
            SELECT user_id, is_private, username FROM users WHERE user_id = ?`, [userId]);
        const user = rows[0]

        if(!rows || rows.length === 0) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }
        //사용자 존재하는지 검사

        const [ lists ] = await pool.query(`
            SELECT * FROM lists WHERE user_id = ?`, [userId]);
        //내가 만든 리스트 조회


        return res.status(200).json({
            "lists": lists
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
//13. 리스트 수정

router.patch("/users/me/lists/:listId", authenticateToken, async (req, res) => {
    try{
        const userId = req.user.userId;
        const { listId } = req.params;
        const { listName, isPrivate, description } = req.body;

        if(!userId) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }

        const [rows] = await pool.query(`
            SELECT user_id FROM users WHERE user_id = ?`, [userId]);
        const user = rows[0]

        if(!rows || rows.length === 0) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }
        //사용자 존재하는지 검사

        const [[list]] = await pool.query(`
            SELECT list_id, list_name, description, is_private, user_id 
            FROM lists WHERE list_id = ?`, [listId]);

        if(!list) {
            return res.status(404).json({
                "message": "리스트가 존재하지 않습니다."
            });
        }
        //리스트 존재하는지 검사

        if(list.user_id !== userId) {
            return res.status(403).json({
                "message": "권한이 없습니다."
            });
        }


        const fields = [];
        const values = [];

        if (listName !== undefined ) {
            fields.push("list_name = ?");
            values.push(listName);
        }
        if (isPrivate !== undefined ) {
            fields.push("is_private = ?");
            values.push(isPrivate);
        }
        if (description !== undefined ) {
            fields.push("description = ?");
            values.push(description);
        }

        values.push(userId);
        values.push(listId);

        if(fields.length > 0) {
            const sql = `
                UPDATE lists SET ${fields.join(", ")} 
                WHERE user_id = ? AND list_id = ?`;
            const [result] = await pool.query(sql, values);
            //undefined가 아닌 수정 항목 DB에서 수정하기

            const [[newList]] = await pool.query(`
                SELECT list_name, description, is_private 
                FROM lists WHERE list_id = ?`, [listId]);

            return res.status(200).json({
                "list": {
                    "listId": listId,
                    "userId": userId, 
                    "listName": newList.list_name,
                    "description": newList.description,
                    "isPrivate": newList.is_private
                }
            });
        }

        return res.status(200).json({
            "list": {
                "listId": listId,
                "userId": userId, 
                "listName": list.list_name,
                "description": list.description,
                "isPrivate": list.is_private
            }
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
//14. 리스트 삭제

router.delete("/users/me/lists/:listId", authenticateToken, async (req, res) => {
    try{
        const userId = req.user.userId;
        const { listId } = req.params;

        if(!userId) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }

        const [rows] = await pool.query(`
            SELECT user_id FROM users WHERE user_id = ?`, [userId]);
        const user = rows[0]

        if(!rows || rows.length === 0) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }
        //사용자 존재하는지 검사


        const [ result ] = await pool.query(`
            DELETE FROM lists 
            WHERE list_id = ? AND user_id = ?`, [listId, userId]);
        //해당 유저가 지정한 리스트 삭제

        if(result.affectedRows === 0) {
            return res.status(404).json({
                "message": "리스트가 존재하지 않습니다."
            });
        }

        await pool.query(`
            DELETE FROM list_members
            WHERE list_id = ?`, [listId]);
        //리스트에 포함된 리스트 멤버 삭제

        return res.status(204).end();
    }
    catch(error){
        console.error(error);
        return res.status(500).json({
            "message": "서버 에러가 발생했습니다."
        });
    }
})
//******************리스트 멤버도 같이 지우기


//=======================================================
//15. 리스트 멤버 추가

router.post("/lists/:listId/members", authenticateToken, async (req, res) => {
    try{
        const myId = req.user.userId;
        const { listId } = req.params;
        const { userId } = req.body;

        if(!myId) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }

        const [[me]] = await pool.query(`
            SELECT user_id FROM users WHERE user_id = ?`, [myId]);
        

        if(!me) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }
        //유저 토큰 확인
    
        const [[ user ]] = await pool.query(`
            SELECT user_id FROM users WHERE user_id = ?`, [userId]);
        if(!user) {
            return res.status(404).json({
                "message": "추가하는 사용자가 존재하지 않습니다."
            })
        }

        const [[ list ]] = await pool.query(`
            SELECT * FROM lists WHERE list_id = ? `, [listId]);

        if(!list) {
            return res.status(404).json({
                "message": "리스트가 존재하지 않습니다."
            });
        }
        //리스트가 존재하는지 검사
        
        if (list.user_id !== myId){
            return res.status(403).json({
                "message": "권한이 없습니다."
            });
        }
        //리스트 제작자와 리스트 수정자의 아이디 비교 

        const [[{ isMember }]] = await pool.query(`
            SELECT EXISTS (
                SELECT 1 FROM list_members 
                WHERE list_id = ? AND member_id = ?
            ) AS isMember`, [listId, userId]);
        
        if(isMember){
            return res.status(409).json({
                "message": "이미 리스트에 포함된 사용자입니다."
            });
        }
        //리스트에 유저가 이미 리스트 멤버에 포함되어있는지 확인

        const addedAt = new Date();
        const [ result ] = await pool.query(`
            INSERT INTO list_members (list_id, member_id, added_at)
            VALUES (?, ?, ?)`, [listId, userId, addedAt]);
        //멤버 추가하기

        return res.status(201).json({
            "listId": listId,
            "userId": userId,
            "added_at": addedAt
        })

    }
    catch(error){
        console.error(error);
        return res.status(500).json({
            "message": "서버 에러가 발생했습니다."
        });
    }
})


//=======================================================
//16. 리스트 멤버 삭제

router.delete("/lists/:listId/members/:memberId", authenticateToken, async (req, res) => {
    try{
        const userId = req.user.userId;
        const { listId, memberId } = req.params;
        
        if(!userId) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }

        const [[user]] = await pool.query(`
            SELECT user_id FROM users WHERE user_id = ?`, [userId]);

        if(!user) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }
        //유저 토큰 확인
    
/*
        const [[ member ]] = await pool.query(`
            SELECT user_id FROM users WHERE user_id = ?`, [memberId]);
        if(!member) {
            return res.status(404).json({
                "message": "삭제하는 사용자가 존재하지 않습니다."
            })
        }
        //조회 대상 존재하는지 확인
*/

        const [[ list ]] = await pool.query(`
            SELECT * FROM lists WHERE list_id = ? `, [listId]);

        if(!list) {
            return res.status(404).json({
                "message": "리스트가 존재하지 않습니다."
            });
        }
        //리스트가 존재하는지 검사
        
        if (list.user_id !== userId){
            return res.status(403).json({
                "message": "권한이 없습니다."
            });
        }
        //리스트 제작자와 리스트 수정자의 아이디 비교 

        
        const [result] = await pool.query(`
            DELETE FROM list_members 
            WHERE list_id = ? AND member_id = ?`, [listId, memberId]);
        //리스트의 멤버 삭제

        if(result.affectedRows !== 0){
            return res.status(204).end();
        }

        return res.status(404).json({
            "message": "해당 리스트 멤버가 존재하지 않습니다."
        });
        //이 list_id & member_id 에 해당하는 멤버가 없는 경우
    }
    catch(error){
        console.error(error);
        return res.status(500).json({
            "message": "서버 에러가 발생했습니다."
        });
    }
})



//=======================================================
//17. 리스트 멤버 조회

router.get("/lists/:listId/members", authenticateToken, async (req, res) => {
    try{
        const userId = req.user.userId;
        const { listId } = req.params;

        
        if(!userId) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }

        const [[user]] = await pool.query(`
            SELECT user_id FROM users WHERE user_id = ?`, [userId]);

        if(!user) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }
        //유저 토큰 확인


        const [[ list ]] = await pool.query(`
            SELECT list_id, is_private, user_id FROM lists WHERE list_id = ? `, [listId]);

        if(!list) {
            return res.status(404).json({
                "message": "리스트가 존재하지 않습니다."
            });
        }
        //리스트가 존재하는지 검사


        
        if (list.user_id === userId || !list.is_private){
            const [ members ] = await pool.query(`
                SELECT * FROM list_members 
                WHERE list_id = ?`, [listId]);
            //내가 추가한 리스트 중 listId의 리스트 멤버 가져오기

            return res.status(200).json({
                "members": members
            })
        }


        else{
            return res.status(403).json({
                "message": "권한이 없습니다."
            });
        }
        //리스트 제작자와 리스트 수정자의 아이디가 다르고 비공개 리스트일 경우
        
    }
    catch(error){
        console.error(error);
        return res.status(500).json({
            "message": "서버 에러가 발생했습니다."
        });
    }
})



//=======================================================
//18. 다른 사용자 리스트 조회

router.get("/users/:userId/lists", authenticateToken, async (req, res) => {
    try{
        const myId = req.user.userId;
        const { userId } = req.params;

        if(!myId) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }

        const [[me]] = await pool.query(`
            SELECT user_id, is_private, username FROM users WHERE user_id = ?`, [myId]);

        if(!me) {
            return res.status(401).json({
                "message": "인증되지 않은 사용자입니다."
            });
        }
        //사용자 토큰 검사


        const [[user]] = await pool.query(`
            SELECT user_id, is_private, username FROM users WHERE user_id = ?`, [userId]);


        if(!user) {
            return res.status(404).json({
                "message": "존재하지 않는 사용자입니다."
            });
        }
        //조회 대상 검사


        const [ publicLists ] = await pool.query(`
            SELECT * FROM lists WHERE user_id = ? AND is_private = 0`, [userId]);

        //타인의 리스트 조회하는 경우 공개 리스트 조회



        return res.status(200).json({
            "lists": publicLists
        });

    }
    catch(error){
        console.error(error);
        return res.status(500).json({
            "message": "서버 에러가 발생했습니다."
        });
    }
})


module.exports = router;