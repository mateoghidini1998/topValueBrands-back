const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth');

const {
    register,
    login,
    getMe
} = require('../controllers/auth.controller');

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login
 *     description: Logs a user into the platform.
 *     security:
 *       - bearerAuth: []   # Esquema de autenticación utilizando un token JWT
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         schema:
 *           type: string
 *         description: Token de autenticación JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: ghidinimateo1@gmail.com
 *               password:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       '200':
 *         description: User authenticated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiaWF0IjoxNzE0NDM0MTk4LCJleHAiOjE3MTcwMjYxOTh9.jBjaNoYK0HCIG1uVGloRmShSyOrNJWgql04tyHswlYg
 *       '400':
 *         description: Bad request error due to incorrect data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       msg:
 *                         type: string
 *                         example: User not found
 */
router.post('/login', login);

/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     description: Register a new user in the system. Requires admin privileges.
 *     security:
 *       - bearerAuth: []   # Esquema de autenticación utilizando un token JWT
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         schema:
 *           type: string
 *         description: Token de autenticación JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: Mateo
 *               lastName:
 *                 type: string
 *                 example: Ghidini
 *               email:
 *                 type: string
 *                 format: email
 *                 example: ghidinimateo1@gmail.com
 *               password:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       '200':
 *         description: User registered successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     firstName:
 *                       type: string
 *                       example: Mateo
 *                     lastName:
 *                       type: string
 *                       example: Ghidini
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: ghidinimateo1@gmail.com
 *                     password:
 *                       type: string
 *                       example: $2a$10$ejj8AnvDufKEuI/v/wwvwOJt11wbQ0iZxpPXwfCwKnQFwPf4N4W1G
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-04-29T21:22:59.473Z"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-04-29T21:22:59.473Z"
 */
router.post('/register', register);
//protect, authorize('admin'),

/**
 * @openapi
 * /api/v1/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user
 *     description: Retrieve information about the current authenticated user.
 *     security:
 *       - bearerAuth: []   # Esquema de autenticación utilizando un token JWT
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         schema:
 *           type: string
 *         description: Token de autenticación JWT
 *     responses:
 *       '200':
 *         description: Successfully retrieved current user information.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     firstName:
 *                       type: string
 *                       example: Mateo
 *                     lastName:
 *                       type: string
 *                       example: Ghidini
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: ghidinimateo1@gmail.com
 *                     role:
 *                       type: string
 *                       example: admin
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-04-29T21:22:59.000Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-04-29T21:22:59.000Z"
 *       '401':
 *         description: Unauthorized error due to missing or invalid token.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *                   example: Not authorized to access this route
 */
router.get('/me', protect, getMe);

module.exports = router;