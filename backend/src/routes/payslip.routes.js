const express = require('express');
const router = express.Router();
const { verifyPayslip } = require('../controllers/payslipVerification.controller');

router.get('/verify/:hash', verifyPayslip);

module.exports = router;
