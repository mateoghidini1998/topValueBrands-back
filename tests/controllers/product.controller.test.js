const { getProductsByPage } = require('../../controllers/products.controller');
const { addExtraInfoToProduct } = require('../../controllers/products.controller');

describe('Product Service', () => {
  describe('findAll', () => {

    it('should return products based on given parameters without middlewares', async () => {
      const req = {
        user: {
          id: '1', 
          role: 'admin'
        },
        query: {
          page: 1,
          limit: 10,
          orderBy: 'product_name',
          sortBy: 'asc',
          keyword: ''
        }
      };
      const res = {
        json: jest.fn()
      };

     
      await getProductsByPage(req, res);

      
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.any(Object)
      }));

     
      const result = res.json.mock.calls[0][0];

     
      expect(result.success).toBe(true);
      expect(result.data.totalPages).toBe(186);
      expect(result.data.totalItems).toBe(1859);
      expect(result.data.data.length).toBe(10); 
      
      expect(result.data).toHaveProperty('totalItems');

      expect(result.data.totalItems).toBe(1859);
    });

    it('should return unauthorized error if user does not have admin role', async () => {
      const req = {
        user: {
          id: '2',
          role: 'user'
        },
        query: {
          page: 1,
          limit: 10,
          orderBy: 'product_name',
          sortBy: 'asc',
          keyword: ''
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await getProductsByPage(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ msg: 'Unauthorized' });
    });
  });


  describe('addExtraInfoToProduct', () => {

    it('should add extra information to a product if user is admin', async () => {
      // Define los parámetros de la solicitud
      const req = {
        user: {
          id: '1', // Simula un usuario con rol de administrador
          role: 'admin' // Rol de administrador
        },
        body: {
          seller_sku: '00-WTH3-LMPN',
          supplier_name: 'HOLAA',
          supplier_item_number: '12345',
          product_cost: 10.99,
          pack_type: 'Box'
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Llama al endpoint
      await addExtraInfoToProduct(req, res);

      // Verifica que se haya llamado a res.status() con el código 200
      expect(res.status).toHaveBeenCalledWith(200);

      // Verifica que se haya llamado a res.json() con el producto actualizado
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        supplier_name: 'HOLAA',
        supplier_item_number: '12345',
        product_cost: 10.99,
        pack_type: 'Box'
      }));
    });

    it('should return unauthorized error if user is not admin', async () => {
      // Define los parámetros de la solicitud
      const req = {
        user: {
          id: '2', // Simula un usuario que no es admin
          role: 'user' // Rol de usuario normal
        },
        body: {
          seller_sku: '00-WTH3-LMPN',
          supplier_name: 'ANIMED Pure MSM 5lb',
          supplier_item_number: '12345',
          product_cost: 10.99,
          pack_type: 'Box'
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Llama al endpoint
      await addExtraInfoToProduct(req, res);

      // Verifica que se haya llamado a res.status() con el código 401
      expect(res.status).toHaveBeenCalledWith(401);

      // Verifica que se haya llamado a res.json() con el mensaje de error esperado
      expect(res.json).toHaveBeenCalledWith({ msg: 'Unauthorized' });
    });

    it('should return not found error if product does not exist', async () => {
      // Define los parámetros de la solicitud
      const req = {
        user: {
          id: '1', // Simula un usuario con rol de administrador
          role: 'admin' // Rol de administrador
        },
        body: {
          seller_sku: 'not-found-sku',
          supplier_name: 'HOLAA',
          supplier_item_number: '12345',
          product_cost: 10.99,
          pack_type: 'Box'
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Llama al endpoint
      await addExtraInfoToProduct(req, res);

      // Verifica que se haya llamado a res.status() con el código 404
      expect(res.status).toHaveBeenCalledWith(404);


    })

  });
});
