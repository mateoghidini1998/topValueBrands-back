const { Supplier } = require('../models');
const asyncHandler = require('../middlewares/async');

//@route    GET api/suppliers
//@desc     Get all suppliers
//@access   Private
exports.getSuppliers = asyncHandler(async (req, res, next) => {
    const suppliers = await Supplier.findAll();
    return res.status(200).json({
        success: true,
        quantity: suppliers.length,
        data: suppliers
    })
});

//@route    POST api/suppliers
//@desc     Create a supplier
//@access   Private
exports.createSupplier = asyncHandler(async (req, res, next) => {
    const { supplier_name } = req.body

    const supplier = await Supplier.create({ supplier_name });

    return res.status(201).json({
        success: true,
        data: supplier
    })
});

//@route  GET api/suppliers/:id
//@desc     Get supplier
//@access   Private
exports.getSupplier = asyncHandler(async (req, res, next) => {
    const supplier = await Supplier.findByPk(req.params.id);

    if (!supplier) return res.status(404).json({ message: 'Supplier not found' })

    return res.status(200).json({
        success: true,
        data: supplier
    })
});

//@route   PUT api/suppliers/:id
//@desc    Update supplier
//@access  Private
exports.updateSupplier = asyncHandler(async (req, res, next) => {
    const supplier = await Supplier.findByPk(req.params.id);

    if (!supplier) {
        return res.status(404).json({
            success: false,
            message: 'Supplier not found'
        })
    }

    await supplier.update(req.body);

    return res.status(200).json({
        success: true,
        data: supplier
    })
});

//@route   DELETE api/suppliers/:id
//@desc    Delete supplier
//@access  Private
exports.deleteSupplier = asyncHandler(async (req, res, next) => {
    const supplier = await Supplier.findByPk(req.params.id);

    if (!supplier) {
        return res.status(404).json({
            success: false,
            message: 'Supplier not found'
        })
    }

    await supplier.destroy();
    return res.status(200).json({
        success: true,
        data: {}
    })
})