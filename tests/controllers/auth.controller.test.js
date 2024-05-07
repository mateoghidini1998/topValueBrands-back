const { register } = require('../../controllers/auth.controller');
const { login } = require('../../controllers/auth.controller');
const { User } = require('../../models');


const dotenv = require('dotenv');

dotenv.config({
    path: './.env'
})

// Función para eliminar el usuario después de la prueba
const deleteUser = async (email) => {
  await User.destroy({ where: { email } });
};

describe('Auth Controller', () => {
  describe('register', () => {
    it('should register a new user if the requesting user is an admin', async () => {
      const req = {
        user: {
          id: '1',
          role: 'admin'
        },
        body: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          password: 'password123'
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
    
      await register(req, res);
    
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        user: expect.objectContaining({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com'
          // Puedes agregar más comprobaciones específicas si es necesario
        })
      }));
    
      // Elimina el usuario creado después de la prueba
      await deleteUser('john.doe@example.com');
    });

    it('should return an unauthorized error if the requesting user is not an admin', async () => {
      const req = {
        user: {
          id: '2',
          role: 'user',
          firstName: 'Ramiro',
          lastName: 'Sarasola',
        },
        body: {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane.doe@example.com',
          password: 'password123'
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ errors: [{ msg: `User ${req.user.firstName} ${req.user.lastName} has no clearance to create a new user` }] });
    });

    it('should return a validation error if the user already exists', async () => {
      // Implement test scenario for existing user

      const req = {
        user: {
          id: '1',
          role: 'admin'
        },
        body: {
          firstName: 'Ramiro',
          lastName: 'Sarasola',
          email: 'ghidinimateo1@gmail.com',
          password: '123456'
        }
      }

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      }

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ errors: [{ msg: `User already exists` }] });

    });
  });

  describe('login', () => {
    it('should authenticate user and return token if credentials are correct', async () => {
      const req = {
        body: {
          email: 'ramirosarasola@gmail.com',
          password: '123456'
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
    
      // Mock de la función de generación de token
      const mockToken = 'mockedToken';
      jest.spyOn(require('../../controllers/auth.controller'), 'sendTokenResponse').mockImplementation((user, statusCode, res) => {
        // Simplemente devuelve el token en formato JSON
        res.status(statusCode).json({
          success: true,
          token: mockToken
        });
      });
    
      // Ejecuta la función login
      await login(req, res);
    
      // Verifica que la función status se haya llamado con el código de estado 200
      expect(res.status).toHaveBeenCalledWith(200);
      // Verifica que la función json se haya llamado con un objeto que incluye la propiedad token
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        token: mockToken
      }));
    });

    it('should return an error if email or password is missing', async () => {
      const req = {
        body: {
          email: 'ramirosarasola@gmail.com',
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ errors: [{ msg: 'Please enter all fields' }] });
    });

    it('should return an error if user is not found', async () => {
      // Implement test scenario for user not found

      const req = {
        body: {
          email: 'notfounduser@gmail.com',
          password: '123456'
        }
      }

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      }

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ errors: [{ msg: 'User not found' }] });

    });

    it('should return an error if credentials are incorrect', async () => {
      const req = {
        body: {
          email: 'ramirosarasola@gmail.com', // Email incorrecto
          password: 'contraseñaincorrecta' // Contraseña incorrecta
        }
      };
    
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
    
      // Ejecuta la función login
      await login(req, res);
    
      // Verifica que la función status se haya llamado con el código de estado 401 (no autorizado)
      expect(res.status).toHaveBeenCalledWith(401);
      // Verifica que la función json se haya llamado con el mensaje de error esperado
      expect(res.json).toHaveBeenCalledWith({ errors: [{ msg: 'Invalid credentials' }] });
    });

  });


});
