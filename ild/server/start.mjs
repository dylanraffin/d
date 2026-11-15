// Lance le serveur : node server/start.mjs  (ou npm start)
import { createApp } from './index.mjs';

const port = Number(process.env.PORT || 3000);
const { server } = createApp();
server.listen(port, () => {
  console.log(`ILD tourne sur http://localhost:${port}`);
  console.log(`Back office : http://localhost:${port}/admin`);
});
