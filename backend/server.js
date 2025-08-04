const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs'); // 🔐 Para encriptar contraseñas

const app = express();
const PORT = 5000;
const saltRounds = 10; // Nivel de encriptación

// Conexión a MySQL (XAMPP)
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'inventario_db'
});

// Verificar conexión
db.connect(err => {
    if (err) {
        console.error('❌ Error al conectar a MySQL:', err);
        return;
    }
    console.log('✅ Conectado a MySQL');
});

// Middleware
app.use(cors({
    origin: '*' // Permitir cualquier origen (para desarrollo)
}));
app.use(bodyParser.json());

// Ruta de prueba
app.get('/', (req, res) => {
    res.send('Servidor funcionando');
});

// === RUTAS CRUD PARA PRODUCTOS ===

app.get('/productos', (req, res) => {
    const sql = "SELECT * FROM productos";
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ msg: err.message });
        res.json(results);
    });
});

app.post('/productos', (req, res) => {
    const { nombre, descripcion, categoria, precio, stock, codigo } = req.body;
    const sql = `INSERT INTO productos (nombre, descripcion, categoria, precio, stock, codigo) VALUES (?, ?, ?, ?, ?, ?)`;
    db.query(sql, [nombre, descripcion, categoria, precio, stock, codigo], (err, result) => {
        if (err) return res.status(500).json({ msg: err.message });
        res.status(201).json({ id: result.insertId, ...req.body });
    });
});

app.put('/productos/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, categoria, precio, stock, codigo } = req.body;
    const sql = `UPDATE productos SET nombre=?, descripcion=?, categoria=?, precio=?, stock=?, codigo=? WHERE id=?`;
    db.query(sql, [nombre, descripcion, categoria, precio, stock, codigo, id], (err) => {
        if (err) return res.status(500).json({ msg: err.message });
        res.json({ msg: 'Producto actualizado' });
    });
});

app.delete('/productos/:id', (req, res) => {
    const { id } = req.params;
    const sql = "DELETE FROM productos WHERE id=?";
    db.query(sql, [id], (err) => {
        if (err) return res.status(500).json({ msg: err.message });
        res.json({ msg: 'Producto eliminado' });
    });
});

// === RUTAS PARA MOVIMIENTOS ===

app.get('/movimientos', (req, res) => {
    const sql = `
        SELECT m.id, m.tipo, m.cantidad, m.fecha, p.nombre AS producto 
        FROM movimientos m 
        JOIN productos p ON m.producto_id = p.id 
        ORDER BY m.fecha DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ msg: err.message });
        res.json(results);
    });
});

app.post('/movimientos/entrada', (req, res) => {
    const { producto_id, cantidad } = req.body;
    const sql = `INSERT INTO movimientos (producto_id, tipo, cantidad) VALUES (?, 'entrada', ?)`;
    
    db.query(sql, [producto_id, cantidad], (err, result) => {
        if (err) return res.status(500).json({ msg: err.message });

        const updateStock = `UPDATE productos SET stock = stock + ? WHERE id = ?`;
        db.query(updateStock, [cantidad, producto_id], (err) => {
            if (err) return res.status(500).json({ msg: err.message });
            res.status(201).json({ msg: 'Entrada registrada y stock actualizado' });
        });
    });
});

app.post('/movimientos/salida', (req, res) => {
    const { producto_id, cantidad } = req.body;
    
    const checkStock = `SELECT stock FROM productos WHERE id = ?`;
    db.query(checkStock, [producto_id], (err, results) => {
        if (err) return res.status(500).json({ msg: err.message });
        
        const stockActual = results[0]?.stock;
        if (!stockActual) return res.status(404).json({ msg: 'Producto no encontrado' });
        if (cantidad > stockActual) return res.status(400).json({ msg: 'Stock insuficiente' });

        const sql = `INSERT INTO movimientos (producto_id, tipo, cantidad) VALUES (?, 'salida', ?)`;
        db.query(sql, [producto_id, cantidad], (err, result) => {
            if (err) return res.status(500).json({ msg: err.message });

            const updateStock = `UPDATE productos SET stock = stock - ? WHERE id = ?`;
            db.query(updateStock, [cantidad, producto_id], (err) => {
                if (err) return res.status(500).json({ msg: err.message });
                res.status(201).json({ msg: 'Salida registrada y stock actualizado' });
            });
        });
    });
});

// ✅ NUEVO: RUTAS DE AUTENTICACIÓN SEGURA

// 🔐 Registro de usuario (contraseña encriptada)
app.post('/auth/register', async (req, res) => {
    const { nombre, email, password, rol = 'usuario' } = req.body;

    if (!nombre || !email || !password) {
        return res.status(400).json({ msg: 'Todos los campos son obligatorios' });
    }

    try {
        // Verificar si el email ya existe
        const checkEmail = `SELECT * FROM usuarios WHERE email = ?`;
        db.query(checkEmail, [email], async (err, results) => {
            if (err) return res.status(500).json({ msg: 'Error en el servidor' });
            if (results.length > 0) {
                return res.status(400).json({ msg: 'El correo ya está registrado' });
            }

            // Encriptar contraseña
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Registrar usuario
            const sql = `INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)`;
            db.query(sql, [nombre, email, hashedPassword, rol], (err, result) => {
                if (err) return res.status(500).json({ msg: 'Error al registrar' });
                res.status(201).json({ msg: 'Usuario registrado con éxito' });
            });
        });
    } catch (error) {
        res.status(500).json({ msg: 'Error interno del servidor' });
    }
});

// 🔑 Login seguro
app.post('/auth/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ msg: 'Email y contraseña son obligatorios' });
    }

    const sql = `SELECT id, nombre, email, rol, password FROM usuarios WHERE email = ?`;
    db.query(sql, [email], async (err, results) => {
        if (err) return res.status(500).json({ msg: 'Error en el servidor' });
        if (results.length === 0) return res.status(400).json({ msg: 'Credenciales inválidas' });

        const usuario = results[0];
        const validPassword = await bcrypt.compare(password, usuario.password);

        if (!validPassword) return res.status(400).json({ msg: 'Credenciales inválidas' });

        // ✅ Login exitoso
        res.json({
            msg: 'Inicio de sesión exitoso',
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                email: usuario.email,
                rol: usuario.rol
            }
        });
    });
});

// === RUTAS PARA USUARIOS (solo lectura y eliminación) ===

// Obtener todos los usuarios (sin contraseña)
app.get('/usuarios', (req, res) => {
    const sql = "SELECT id, nombre, email, rol, fecha_registro FROM usuarios ORDER BY id DESC";
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ msg: err.message });
        res.json(results);
    });
});

// Eliminar usuario
app.delete('/usuarios/:id', (req, res) => {
    const { id } = req.params;
    if (id == 1) {
        return res.status(403).json({ msg: 'No se puede eliminar al usuario principal' });
    }
    const sql = "DELETE FROM usuarios WHERE id = ?";
    db.query(sql, [id], (err) => {
        if (err) return res.status(500).json({ msg: err.message });
        res.json({ msg: 'Usuario eliminado' });
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});