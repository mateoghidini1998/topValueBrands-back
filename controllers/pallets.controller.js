const { Pallet, PurchaseOrder, WarehouseLocation } = require("../models");
const asyncHandler = require("../middlewares/async");

//@route    POST api/v1/pallets
//@desc     Create a pallet
//@access   Private
exports.createPallet = asyncHandler(async (req, res) => {
  const { pallet_number, warehouse_location_id, purchase_order_id } = req.body;

  const location = await WarehouseLocation.findOne({ where: { id: warehouse_location_id } });
  const purchase_order = await PurchaseOrder.findOne({ where: { id: purchase_order_id } });
  
  let pallet = await Pallet.findOne({ where: { pallet_number } });

  if (location.current_capacity <= 0) {
    return res.status(400).json({
      msg: `The location with id ${warehouse_location_id} has no space available`,
    });
  }

  if (!location) {
    return res.status(404).json({ msg: "Warehouse location not found" });
  }

  if (!purchase_order) {
    return res.status(404).json({ msg: "Purchase order not found" });
  }

  if (pallet) {
    return res.status(400).json({ msg: "Pallet Number already exists" });
  }

  pallet = await Pallet.create({ pallet_number, warehouse_location_id, purchase_order_id });

  location.current_capacity -= 1;
  await location.save();

  return res.status(201).json({ pallet });
});


//@route    GET api/v1/pallets
//@desc     Get pallets
//@access   Private
exports.getPallets = asyncHandler(async (req, res) => {
    const pallets = await Pallet.findAll()

    return res.status(200).json({ 
        count: pallets.length,
        pallets 
    })
})

//@route    GET api/v1/pallets/:id
//@desc     Get pallet by id
//@access   Private
exports.getPallet = asyncHandler(async (req, res) => {
    const pallet = await Pallet.findOne({ where: {id: req.params.id} })

    if(!pallet) {
        return res.status(404).json({msg: "Pallet not found"})
    }

    return res.status(200).json({ 
        pallet 
    })
})

//@route    DELETE api/v1/pallets/:id
//@desc     Delete pallet by id
//@access   Private
exports.deletePallet = asyncHandler(async (req, res) => {
  const pallet = await Pallet.findOne({ where: { id: req.params.id } });

  if (!pallet) {
    return res.status(404).json({ msg: "Pallet not found" });
  }

  let location = await WarehouseLocation.findOne({ where: { id: pallet.warehouse_location_id } });

  if (!location) {
    return res.status(404).json({ msg: "Location not found" });
  }

  location.current_capacity += 1;
  await location.save();

  await pallet.destroy();

  return res.status(204).end();
});


//@route    PUT api/v1/pallets/:id
//@desc     update pallet by id
//@access   Private
exports.updatePallet = asyncHandler(async (req, res) => {
  const { pallet_number, warehouse_location_id, purchase_order_id } = req.body;

  let pallet = await Pallet.findOne({ where: { id: req.params.id } });
  let newLocation = await WarehouseLocation.findOne({ where: { id: warehouse_location_id } });
  let purchase_order = await PurchaseOrder.findOne({ where: { id: purchase_order_id } });

  if (!pallet) {
    return res.status(404).json({ msg: "Pallet not found" });
  }

  if (!newLocation) {
    return res.status(404).json({ msg: "Warehouse location not found" });
  }

  if (!purchase_order) {
    return res.status(404).json({ msg: "Purchase order not found" });
  }

  if (pallet.warehouse_location_id !== warehouse_location_id && newLocation.current_capacity <= 0) {
    return res.status(400).json({
      msg: `The location with id ${warehouse_location_id} has no space available`,
    });
  }

  let oldLocation = await WarehouseLocation.findOne({ where: { id: pallet.warehouse_location_id } });

  await pallet.update({
    pallet_number: pallet_number || pallet.pallet_number,
    warehouse_location_id: warehouse_location_id || pallet.warehouse_location_id,
    purchase_order_id: purchase_order_id || pallet.purchase_order_id,
  });

  newLocation.current_capacity -= 1;
  await newLocation.save()
  oldLocation.current_capacity += 1;
  await oldLocation.save()

  console.log("OLD LOCATION: ", oldLocation, " CAPACITY: ", oldLocation.current_capacity)
  console.log("NEW LOCATION: ", newLocation, " CAPACITY: ", newLocation.current_capacity)

  return res.status(200).json({ msg: "Pallet updated successfully", pallet });
});

