const supplierRepository = require("../repositories/supplier.repository");

const getAllSuppliers = async () => {
  return await supplierRepository.FindAll();
};

const createSupplier = async (supplier_name) => {
  return await supplierRepository.Create(supplier_name);
};

const getSupplierById = async (id) => {
  return await supplierRepository.FindById(id);
};

const updateSupplier = async (id, supplier_name) => {
  const supplier = await getSupplierById(id);
  if (!supplier) throw new Error("Supplier not found");
  return await supplierRepository.Update(id, supplier_name);
};

const deleteSupplier = async (id) => {
  const supplier = await getSupplierById(id);
  if (!supplier) throw new Error("Supplier not found");
  return await supplierRepository.Delete(id);
};

module.exports = {
  getAllSuppliers,
  createSupplier,
  getSupplierById,
  updateSupplier,
  deleteSupplier,
};
