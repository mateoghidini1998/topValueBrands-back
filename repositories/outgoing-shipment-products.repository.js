const { OutgoingShipmentProduct } = require("../models");

const ExistsByPalletProductId = async (palletProductId, transaction) => {
  const count = await OutgoingShipmentProduct.count({
    where: { pallet_product_id: palletProductId },
    transaction,
  });

  console.log("COUNT: ", count)
  return count > 0;
};

module.exports = {
    ExistsByPalletProductId
}