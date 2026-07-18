const express = require("express");
const router = express.Router();

const authenticate = require("../middleware/authenticate");

const {
  createReservation,
  getReservations,
  getReservationByID,
  updateReservation,
  cancelReservation,
  checkInReservation,
  checkOutReservation,
  getReservationsCalendar,
  getReservationStatistics,
} = require("../controllers/reservationsController");

//CREATE RESERVATION
router.post("/create", authenticate, createReservation);
//GET RESERVATIONS
router.get("/", authenticate, getReservations);
//RESERVATIONS CALENDAR
router.get("/calendar", authenticate, getReservationsCalendar);
//RESERVATIONS STATISTICS
router.get("/statistics", authenticate, getReservationStatistics);
//GET RESERVATION BY ID
router.get("/:reservation_id", authenticate, getReservationByID);
//UPDATE RESERVATION
router.put("/:reservation_id", authenticate, updateReservation);
//CANCEL RESERVATION
router.put("/:reservation_id/cancel", authenticate, cancelReservation);
//CHECK-IN
router.put("/:reservation_id/check-in", authenticate, checkInReservation);
//CHECK-OUT
router.put("/:reservation_id/check-out", authenticate, checkOutReservation);

module.exports = router;
