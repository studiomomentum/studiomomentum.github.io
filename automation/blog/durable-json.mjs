import fs from 'node:fs/promises';
import path from 'node:path';
// Flush both data and the renamed directory entry before acknowledging a receipt.
export async function writeDurableJson(file, value) {
  await fs.mkdir(path.dirname(file), {recursive:true, mode:0o700});
  const temporary=file+'.tmp';
  const handle=await fs.open(temporary,'w',0o600);
  try {await handle.writeFile(JSON.stringify(value));await handle.sync();}
  finally {await handle.close();}
  await fs.rename(temporary,file);
  const directory=await fs.open(path.dirname(file),'r');
  try {await directory.sync();} finally {await directory.close();}
}
