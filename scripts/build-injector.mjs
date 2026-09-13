import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('..', import.meta.url);
const template = await readFile(new URL('./theme/runtime-template.js', root), 'utf8');
const css = await readFile(new URL('./theme/theme.css', root), 'utf8');
const selectors = JSON.parse(await readFile(new URL('./theme/selectors.json', root), 'utf8'));
const theme = JSON.parse(await readFile(new URL('./theme/theme.json', root), 'utf8'));
const backgroundFiles = {
  centered: 'melody-background-subject-centered.png',
  right: 'melody-background-standard-right.png',
};
const requestedBackground = process.env.MELODY_BACKGROUND;
if (requestedBackground) {
  const image = backgroundFiles[requestedBackground];
  if (!image) throw new Error(`MELODY_BACKGROUND must be centered or right (received ${requestedBackground})`);
  theme.image = image;
}
const background = (await readFile(new URL(`./theme/${theme.image}`, root))).toString('base64');
const icon = (await readFile(new URL('./pet/home-icon.png', root))).toString('base64');
const art = `data:image/png;base64,${background}`;
const petIcon = `data:image/png;base64,${icon}`;
const source = template
  .replace('__MELODY_CSS__', JSON.stringify(css))
  .replace('__MELODY_SELECTORS__', JSON.stringify(selectors))
  .replace('__MELODY_THEME__', JSON.stringify(theme))
  .replace('__MELODY_ART__', JSON.stringify(art))
  .replace('__MELODY_PET_ICON__', JSON.stringify(petIcon));
await writeFile(new URL('./theme/theme-inject.js', root), source.trimEnd() + '\n');
console.log('built theme/theme-inject.js');
