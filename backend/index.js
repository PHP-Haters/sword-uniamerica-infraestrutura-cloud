const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

// Inicializando o app Express
const app = express();

// Lê a porta injetada pelo Cloud Run ou utiliza 5000 localmente
const port = process.env.PORT || 5000;

// Configurações de observabilidade
const SERVICE_NAME = process.env.SERVICE_NAME || 'sword-backend';
const ENVIRONMENT = process.env.ENVIRONMENT || 'production';

function log(level, message, extra = {}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    severity: level,
    service_name: SERVICE_NAME,
    environment: ENVIRONMENT,
    level,
    message,
    ...extra
  }));
}

// Habilita CORS e processamento de JSON
app.use(cors());
app.use(bodyParser.json());

app.use((req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();

    const durationMs = Number(end - start) / 1_000_000;

    log(
      res.statusCode >= 500
        ? 'ERROR'
        : res.statusCode >= 400
          ? 'WARN'
          : 'INFO',
      'HTTP request',
      {
        http_method: req.method,
        route: req.route?.path || req.path,
        status_code: res.statusCode,
        duration_ms: Math.round(durationMs)
      }
    );
  });

  next();
});

// Obtém a URI do MongoDB a partir das variáveis de ambiente
const mongoURI = process.env.MONGO_URI;

if (!mongoURI) {
  log('ERROR', 'MONGO_URI não configurada');
  process.exit(1);
}

// Conexão com o MongoDB
mongoose.connect(mongoURI)
  .then(() => {
    log('INFO', 'Conexão com MongoDB estabelecida');
  })
  .catch((err) => {
    log('ERROR', 'Erro ao conectar ao MongoDB', {
      error: err.message
    });
  });

app.get('/api/health', (req, res) => {
  res.status(200).send('Backend OK');
});

const TodoSchema = new mongoose.Schema({
  text: { type: String, required: true },
  completed: { type: Boolean, default: false },
});

const Todo = mongoose.model('Todo', TodoSchema);

app.get('/api/todos', async (req, res) => {
  try {
    const todos = await Todo.find();

    res.json(todos);
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
});

app.post('/api/todos', async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({
      message: 'O campo "text" é obrigatório',
    });
  }

  const todo = new Todo({
    text,
    completed: false,
  });

  try {
    const newTodo = await todo.save();

    res.status(201).json(newTodo);
  } catch (err) {
    res.status(400).json({
      message: err.message,
    });
  }
});

app.patch('/api/todos/:id', async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);

    if (!todo) {
      return res.status(404).json({
        message: 'Tarefa não encontrada',
      });
    }

    todo.completed = !todo.completed;

    await todo.save();

    res.json(todo);
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
});

app.delete('/api/todos/:id', async (req, res) => {
  try {
    const todo = await Todo.findByIdAndDelete(req.params.id);

    if (!todo) {
      return res.status(404).json({
        message: 'Tarefa não encontrada',
      });
    }

    res.json({
      message: 'Tarefa excluída com sucesso',
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
});

app.listen(port, () => {
  log('INFO', 'Servidor iniciado', {
    port
  });
});