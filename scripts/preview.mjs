import { createApp } from '../server.mjs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const {server}=await createApp({directory:await mkdtemp(join(tmpdir(),'gaocang-public-preview-'))});
server.listen(8770,'127.0.0.1',()=>console.log('Public preview: http://127.0.0.1:8770/'));
