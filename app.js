const express = require('express');
const app = express();
const path = require('path');
const axios = require('axios'); // Importe a biblioteca axios
const dotenv = require('dotenv'); // Importe a biblioteca dotenv
const XLSX = require('xlsx');
const bodyParser = require('body-parser');
const multer = require('multer'); // Importe a biblioteca multer para lidar com o upload de arquivos
const { log } = require('console');


// Carregue as variáveis de ambiente do arquivo .env
dotenv.config();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '5000mb' }));
app.use(express.urlencoded({ limit: '5000mb', extended: true }));
app.use(bodyParser.json());

// Configuração do multer para lidar com o upload de arquivos
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/sendInvite', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'disparadorConvites.html'));
});

app.get('/addGrup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'disparadorAddGrupo.html'));
});

app.post('/findData', async (req, res) => {
  const instancia = req.body.instancia;
  const urlEvo = req.body.urlevo;
  const apikey = req.body.key;

  console.log(instancia)
  console.log(urlEvo)
  console.log(apikey)

  if (!instancia) {
    return res.status(400).json({ error: 'A instância deve ser fornecida no corpo da solicitação.' });
  }

  if (!apikey) {
    return res.status(500).json({ error: 'A chave da API não foi configurada corretamente.' });
  }

  const url = `${urlEvo}/group/fetchAllGroups/${instancia}?getParticipants=true`;

  try {
    // Fazer a solicitação HTTP usando axios
    const response = await axios.get(url, {
      headers: {
        'apikey': apikey,
      },
    });

    // Responder com os dados da resposta HTTP
    //console.log({ data: response.data })
    res.json({ data: response.data });
  } catch (error) {
    console.error('Erro ao fazer a solicitação HTTP:', error.message);
    res.status(500).json({ error: 'Erro ao fazer a solicitação HTTP.' });
  }
});


app.post('/downloadXLSX', (req, res) => {
  const data = req.body;

  if (!data || !Array.isArray(data) || data.length === 0) {
    return res.status(400).json({ error: 'Dados inválidos para criar o arquivo XLSX.' });
  }

  // Criar um novo workbook
  const workbook = XLSX.utils.book_new();

  // Iterar sobre os dados e adicionar colunas
  data.forEach((item, index) => {
    const columnData = item.participants.map(participant => participant.id);
    columnData.unshift(item.subject);

    // Adicionar a planilha ao workbook
    const worksheet = XLSX.utils.aoa_to_sheet(columnData.map(value => [value]));
    XLSX.utils.book_append_sheet(workbook, worksheet, `Dados${index + 1}`);
  });

  // Criar um buffer com o conteúdo do arquivo XLSX
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  // Salvar o arquivo em disco (opcional)
  // fs.writeFileSync('dados.xlsx', buffer);

  // Enviar o arquivo como uma resposta HTTP
  res.setHeader('Content-Disposition', 'attachment; filename=dados.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.end(buffer);
});


// Rota para lidar com o upload do arquivo XLSX e fazer a requisição HTTP
app.post('/sendInviteForPartic', upload.single('xlsxFile'), async (req, res) => {
  const { name } = req.body;
  const customMessage = req.body.customMessage;
  const fileBuffer = req.file.buffer;


  if (!name || !fileBuffer) {
    return res.status(400).json({ error: 'Nome e arquivo XLSX são obrigatórios.' });
  }

  // Ler o arquivo XLSX
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

  // Extrair os números de telefone da planilha e formatá-los
  const numbers = data.slice(1).map(row => `${row[0]}@s.whatsapp.net`);

  console.log(numbers);

  // Fazer a requisição HTTP usando axios
  const apiKey = process.env.API_KEY;
  const groupid = name;

  console.log(groupid)

  try {
    const response = await axios.post('https://evolution.dagestao.com/group/sendInvite/Dev06-ChipSMS', {
      groupJid: groupid,
      description: customMessage, // Use a mensagem personalizada aqui
      numbers,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
    });

    res.json({ data: response.data });
  } catch (error) {
    console.error('Erro ao fazer a solicitação HTTP:', error.message);
    res.status(500).json({ error: 'Erro ao fazer a solicitação HTTP.' });
  }
});

app.post('/addPartic', upload.single('xlsxFile'), async (req, res) => {
  const { name, customMessage, instancia, urlevo, key } = req.body;
  const fileBuffer = req.file.buffer;


  if (!name || !fileBuffer) {
    return res.status(400).json({ error: 'Nome e arquivo XLSX são obrigatórios.' });
  }

  // Ler o arquivo XLSX
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

  // Extrair os números de telefone da planilha e formatá-los
  const numbers = data.slice(1).map(row => `${row[0]}`);

  // Fazer a requisição HTTP usando axios em lotes de 10 números
  const groupid = name;

  try {
    const batchSize = 5;
    const totalNumbers = numbers.length;
    let currentIndex = 0;

    while (currentIndex < totalNumbers) {
      const batchNumbers = numbers.slice(currentIndex, currentIndex + batchSize);
      
      const response = await axios.put(`${urlevo}/group/updateParticipant/${instancia}?groupJid=${encodeURIComponent(groupid)}`, {
        action: 'add',
        participants: batchNumbers,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
        },
      });

       // Adicionar um atraso de 1 segundo após cada requisição
    await new Promise(resolve => setTimeout(resolve, 60000));


      currentIndex += batchSize;
    }

    res.json({ success: true, message: 'Todos os números foram processados com sucesso.' });
  } catch (error) {
    console.error('Erro ao fazer a solicitação HTTP:', error.message);
    res.status(500).json({ error: 'Erro ao fazer a solicitação HTTP.' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
