const express = require('express');
const router = express.Router();
const { addAccessTokenHeader } = require('../middlewares/lwa_token');

const {
    syncDBWithAmazon,
    downloadReport,
} = require('../controllers/reports.controller');


/**
 * @swagger
 * /api/v1/reports/sync:
 *   get:
 *     tags: [Reports]
 *     summary: Synchronizes the database with Amazon.
 *     security:
 *       - bearerAuth: []   # Esquema de autenticación utilizando un token JWT
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         schema:
 *           type: string
 *         description: Token de autenticación JWT
 *     description: This endpoint triggers the synchronization process between the local database and Amazon.
 *     responses:
 *       200:
 *         description: The synchronization process was successful.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Synchronization successful."
 *       500:
 *         description: An error occurred during the synchronization process.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "An error occurred."
 */
router.get('/sync', addAccessTokenHeader, syncDBWithAmazon);
router.get('/download/:filename', downloadReport);


module.exports = router;