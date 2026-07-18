const express = require("express");
const router = express.Router();

const authenticate = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");

const {
  createProperty,
  getProperties,
  getPropertyById,
  updateProperty,
  deleteProperty,

  publishProperty,
} = require("../controllers/propertiesController");

const {
  createRoomType,
  getRoomTypes,
  getRoomTypeByID,
  updateRoomType,
  activateRoomType,
  deactivateRoomType,
} = require("../controllers/roomTypesController");

const {
  createRatePlan,
  getRatePlans,
  getRatePlanByID,
  updateRatePlan,
  activateRatePlan,
  deactivateRatePlan,
} = require("../controllers/ratePlansController");

const {
  initializeRoomTypeAvailability,
  getAvailabilityCalendar,
  updateRoomTypeAvailability,
  getRoomTypeCalendar,
} = require("../controllers/availabilityController");

const {
  updateRatePlanDaily,
  getRatePlanDaily,
} = require("../controllers/ratePlanDailyController");

//#######################
// PROPERTIES METHODS
//#######################

router.post("/", authenticate, createProperty);
router.get("/", authenticate, getProperties);

//#######################
//CHANNEX SYNC
//#######################

router.post("/:property_id/publish", authenticate, publishProperty);

//#######################
// ROOM TYPES
//#######################

router.post("/:property_id/room-types", authenticate, createRoomType);

router.get("/:property_id/room-types", authenticate, getRoomTypes);
router.get("/:property_id/room-types/:room_type_id",authenticate,getRoomTypeByID,);

router.put("/:property_id/room-types/:room_type_id",authenticate,updateRoomType,);
router.put("/:property_id/room-types/:room_type_id/activate",authenticate,activateRoomType,);
router.put("/:property_id/room-types/:room_type_id/deactivate",authenticate,deactivateRoomType,);

//#######################
// RATE PLANS
//#######################
router.post("/:property_id/room-types/:room_type_id/rate-plans",authenticate,createRatePlan,);

router.get("/:property_id/room-types/:room_type_id/rate-plans",authenticate,getRatePlans,);
router.get("/:property_id/room-types/:room_type_id/rate-plans/:rate_plan_id",authenticate,getRatePlanByID,);

router.put("/:property_id/room-types/:room_type_id/rate-plans/:rate_plan_id",authenticate,updateRatePlan,);

router.put("/:property_id/room-types/:room_type_id/rate-plans/:rate_plan_id/activate",authenticate,activateRatePlan,);
router.put("/:property_id/room-types/:room_type_id/rate-plans/:rate_plan_id/deactivate",authenticate,deactivateRatePlan,);

//#######################
// RATE PLAN DAILY
//#######################
router.put("/:property_id/room-types/:room_type_id/rate-plans/:rate_plan_id/daily",authenticate,updateRatePlanDaily,);
router.get("/:property_id/room-types/:room_type_id/rate-plans/:rate_plan_id/daily",authenticate,getRatePlanDaily,);

//#######################
// AVAILABILITY
//#######################
router.post("/:property_id/room-types/:room_type_id/initialize-availability",authenticate,initializeRoomTypeAvailability,);
router.get("/:property_id/availability-calendar",authenticate,getAvailabilityCalendar,);
router.put("/:property_id/room-types/:room_type_id/update-availability",authenticate,updateRoomTypeAvailability,);
router.get("/:property_id/room-types/:room_type_id/calendar",authenticate,getRoomTypeCalendar,);

//#######################
// PROPERTY BY ID
//#######################

router.get("/:id", authenticate, getPropertyById);
router.put("/:id", authenticate, updateProperty);
router.delete("/:id", authenticate, deleteProperty);

module.exports = router;
