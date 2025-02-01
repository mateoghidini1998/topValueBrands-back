const supplierService = require('../services/supplier.service');
const asyncHandler = require('../middlewares/async');

//@route    GET api/suppliers
//@desc     Get all suppliers
//@access   Private
exports.getSuppliers = asyncHandler(async (req, res) => {
  const suppliers = await supplierService.getAllSuppliers();
  return res.status(200).json({
    success: true,
    quantity: suppliers.length,
    data: suppliers
  });
});

//@route    POST api/suppliers
//@desc     Create a supplier
//@access   Private
exports.createSupplier = asyncHandler(async (req, res) => {
  const { supplier_name } = req.body;
  await supplierService.createSupplier(supplier_name);
  return res.status(201).json({ success: true, message: 'Supplier created successfully' });
});

//@route  GET api/suppliers/:id
//@desc     Get supplier
//@access   Private
exports.getSupplier = asyncHandler(async (req, res) => {
  const supplier = await supplierService.getSupplierById(req.params.id);
  if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

  return res.status(200).json({
    success: true,
    data: supplier
  });
});

//@route   PUT api/suppliers/:id
//@desc    Update supplier
//@access  Private
exports.updateSupplier = asyncHandler(async (req, res) => {
  try {
    await supplierService.updateSupplier(req.params.id, req.body.supplier_name);
    return res.status(200).json({ success: true, message: 'Supplier updated successfully' });
  } catch (error) {
    return res.status(404).json({ success: false, message: error.message });
  }
});

//@route   DELETE api/suppliers/:id
//@desc    Delete supplier
//@access  Private
exports.deleteSupplier = asyncHandler(async (req, res) => {
  try {
    await supplierService.deleteSupplier(req.params.id);
    return res.status(200).json({ success: true, message: 'Supplier deleted successfully' });
  } catch (error) {
    return res.status(404).json({ success: false, message: error.message });
  }
});
