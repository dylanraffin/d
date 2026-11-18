// Lance le serveur : node server/start.mjs  (ou npm start)
import { createApp } from './index.mjs';

const port = Number(process.env.PORT || 3000);
const { server, config } = createApp();
server.listen(port, () => {
  console.log(`${config.brand.name} tourne sur http://localhost:${port}${config.edition === 'cruise' ? ' (site public, puis la carte sur /carte)' : ''}`);
  console.log(`Back office : http://localhost:${port}/admin`);
});
