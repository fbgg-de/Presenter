import type { ISong } from '@/song';
import { Song } from '@/song';

/*
const search = (value: string) => {
	const result = [];
	const body = new FormData();
	body.append('numPerPage', 10);
	body.append('search', value);

	const result = await fetch('https://songselect.ccli.com/api/GetSongSearchResults', {
		method: 'POST',
		credentials: 'include',
		body,
	});
	JSON.parse(result).payload.items.forEach(({ title, songNumber, authors }) => {
		result.push({
			title,
			songNumber,
			authors
		});
	});

	return result;
}

const lyrics = (songNumber: number) => {
	const result = await fetch(´https://songselect.ccli.com/api/GetSongDetails?songNumber=${songNumber}`, {
		credentials: 'include',
	});
	const { title, authors, lyrics, copyrights } = JSON.parse(result).payload;
}
 */

export const CCLISong = (fileName: string, content: string): ISong => {
  const song = new Song();
  const blockOrder: string[] = []; // Temporary array to collect block order

  if (fileName.endsWith('-lyrics.txt')) {
    const blocks = content.trim().split('\n\n');

    song.title = blocks.shift()?.trim() ?? '';

    const info = blocks.pop()?.split('\n');
    if (info?.length) {
      song.authors = info.shift()?.trim() ?? '';
      song.songNumber = parseInt(info.shift()?.replace(/\D/g, '') ?? '-1');
      song.account = parseInt(info.pop()?.replace(/\D/g, '') ?? '-1');

      const copyright: string[] = [];
      while (info.length > 0 && info[0] && !info[0].trim().startsWith('©')) {
        info.shift();
      }
      while (info.length > 0 && info[0] && !info[0].includes('www.ccli.com')) {
        const line = info.shift()?.trim();
        if (line) {
          copyright.push(line);
        }
      }

      song.copyright = copyright.join(' | ');
    }

    blocks.forEach((block) => {
      const row = block.split('\n').filter((e) => e !== '');
      const name = row.shift() ?? '';
      const type = song.generateBlockName(name);

      blockOrder.push(type);
      song.blocks[type] = row;
    });
  } else {
    const blocks = content.trim().split('\r\n\r\nCCLI-');
    const text = blocks.shift();

    if (text) {
      if (blocks.length === 1) {
        const info = blocks.shift();
        const rows = info?.trim().split('\r\n');

        if (rows && rows.length > 4) {
          song.songNumber = parseInt(rows.shift()!.replace(/\D/g, ''));
          song.authors = rows.shift()!.trim();

          song.account = parseInt(rows.pop()!.replace(/\D/g, ''));
          const url = rows.pop()!.trim(); // url
          if (url !== 'www.ccli.com') {
            rows.push(url);
          }

          const licenseNotes = rows.pop()!.trim();
          if (!licenseNotes.includes('SongSelect®')) {
            rows.push(licenseNotes);
          }

          const copyright: string[] = [];
          // Skip empty lines and find copyright section
          while (rows.length > 0 && rows[0] && !rows[0].trim().startsWith('©')) {
            const line = rows.shift();
            // Stop if we've gone too far (hit another section marker)
            if (line && (line.includes('CCLI') || line.includes('SongSelect'))) {
              break;
            }
          }
          // Collect all copyright lines
          while (rows.length > 0 && rows[0]) {
            const row = rows.shift()?.trim();
            if (row && !row.includes('Public Domain') && !row.includes('CCLI')) {
              copyright.push(row);
            }
          }

          song.copyright = copyright.join(' | ');
        }
      }

      const rows = text.trim().split('\r\n');
      song.title = rows.splice(0, 3).shift() ?? '';

      rows
        .join('\n')
        .split('\n\n\n')
        .forEach((block) => {
          const row = block.split('\n').filter((e) => e !== '');
          const type = song.generateBlockName(row.shift());

          blockOrder.push(type);
          song.blocks[type] = row;
        });
    }
  }

  // Set initialOrder and create Default order
  song.initialOrder = blockOrder;
  song.order = { Default: blockOrder };

  return song;
};
