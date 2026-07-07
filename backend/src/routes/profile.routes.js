const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  createProfileUpdateRequest,
  listEmployeeProfileRequests,
  listPendingProfileRequests,
  reviewProfileUpdateRequest
} = require('../controllers/profileUpdate.controller');

router.post('/employee/profile-request', authenticate, createProfileUpdateRequest);
router.get('/employee/profile-requests', authenticate, listEmployeeProfileRequests);
router.get('/admin/profile-requests', authenticate, authorize('ADMIN'), listPendingProfileRequests);
router.put('/admin/profile-requests/:id', authenticate, authorize('ADMIN'), reviewProfileUpdateRequest);

module.exports = router;
