const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authenticate");


const {
    getGuests,
    getGuestById,
    getGuestStatistics,
    updateGuest
}= require("../services/guestService.js");


router.get("/guests",authenticate,getGuests);


module.exports = router;