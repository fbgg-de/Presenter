import { useRef, useEffect, useState, ReactNode } from 'react';
import {
  Button,
  SpeedDialIcon,
  SpeedDial,
  Chip,
  Box,
  Drawer,
  IconButton,
  InputAdornment,
  Stack,
  styled,
  Tab,
  Tabs,
  TextField,
  Typography,
  Badge,
  SpeedDialAction,
  TextFieldProps,
} from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppDispatch } from '@/store';
import { SongOrderEditor } from './SongOrderEditor';
import {
  Close as CloseIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
  Add as AddIcon,
  InsertPageBreak as PageBreakIcon,
  GTranslate as TranslateIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import type { ISong, TBlocks } from '@/song';
import { SONG_BLOCK_SEPARATOR, Song } from '@/song';
import { useCreateSongMutation, useUpdateSongMutation } from '@/api/songs.api';
import { addSongToStore, updateSongInStore } from '@/store/songsSlice';
import { useGetSettings } from '@/store/settingsSlice';
import { useMetrics } from '@/hooks/useMetrics';
import { useIsMobile } from '@/hooks/useIsMobile';

type Block = { name: string; lines: string[] };

const StyledInput = styled(TextField)(({ theme }) => ({
  background: theme.palette.background.paper,
  borderColor: theme.palette.background.paper,
}));

const Input = (props: TextFieldProps & { startAdornment?: ReactNode; endAdornment?: ReactNode }) => {
  const { startAdornment, endAdornment, slotProps, ...inputProps } = props;
  const customSlotProps = {
    ...slotProps,
    input: {
      ...slotProps?.input,
      startAdornment: startAdornment ? <InputAdornment position="start">{startAdornment}</InputAdornment> : null,
      endAdornment: endAdornment ? <InputAdornment position="end">{endAdornment}</InputAdornment> : null,
    },
  };

  return <StyledInput {...inputProps} slotProps={customSlotProps} />;
};

const SpeedDialTranslate = styled(SpeedDial)`
  margin: 4px;
  width: 32px;
  height: 32px;
  & .MuiFab-root {
    width: 32px;
    height: 32px;
    min-width: 32px;
    min-height: 32px;
    background: transparent;
  }
  & .MuiSpeedDial-actions {
    align-items: center;
  }
`;

export const SongEditor = (props: {
  open: boolean;
  setOpen: (open: boolean) => void;
  song?: ISong;
  onSongCreated?: (song: ISong) => void;
}) => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const { defaultNewVerseName } = useGetSettings();
  const isMobile = useIsMobile();

  const [createSongMutation] = useCreateSongMutation();
  const [updateSongMutation] = useUpdateSongMutation();
  const { trackEvent } = useMetrics();

  const { open, setOpen, song, onSongCreated } = props;

  const inputRef = useRef<HTMLInputElement>(null);
  const [openTranslation, setOpenTranslation] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [tab, setTab] = useState(0);
  const [blocks, _setBlocks] = useState<Block[]>([]);
  const [blocksOrder, setBlocksOrder] = useState<string[]>([]);

  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [copyright, setCopyright] = useState('');
  const [order, setOrder] = useState<string[]>([]);
  const [orders, setOrders] = useState<{ [key: string]: string[] }>({ Default: [] });
  const [currentOrder, setCurrentOrder] = useState<string>('Default');
  const [block, setBlock] = useState('');
  const [newBlock, setNewBlock] = useState('');

  const languages = ['EN', 'DE']; // TODO: derive from account settings

  const setBlocks = (blocks: Block[]) => {
    blocks.sort((a, b) => a.name.localeCompare(b.name));
    _setBlocks(blocks);
    setBlocksOrder(blocks.map((block) => block.name));
    setOrder(order.filter((order) => !!blocks.find((block) => block.name === order)));
    setIsDirty(true);
  };

  const init = () => {
    if (song) {
      setTab(0);
      setIsDirty(false);

      const blocks: Block[] = [];

      if (song.initialOrder && song.initialOrder.length > 0) {
        song.initialOrder.forEach((blockName) => {
          if (song.blocks[blockName]) {
            blocks.push({ name: blockName, lines: song.blocks[blockName] });
          }
        });
        for (const [name, lines] of Object.entries(song.blocks)) {
          if (!song.initialOrder.includes(name)) {
            blocks.push({ name, lines });
          }
        }
      } else {
        for (const [name, lines] of Object.entries(song.blocks)) {
          blocks.push({ name, lines });
        }
      }

      _setBlocks(blocks);
      setBlocksOrder(blocks.map((b) => b.name));

      setTitle(song.title);
      setAuthors(song.authors ?? '');
      setCopyright(song.copyright ?? '');

      if (song.order && Object.keys(song.order).length > 0) {
        setOrders(song.order);
        const firstOrderName = Object.keys(song.order)[0];
        setCurrentOrder(firstOrderName);
        setOrder(song.order[firstOrderName] ?? []);
      } else {
        const defaultOrders = { Default: song.initialOrder || [] };
        setOrders(defaultOrders);
        setCurrentOrder('Default');
        setOrder(song.initialOrder || []);
      }
    }
  };

  useEffect(() => {
    init();
  }, [song]);

  useEffect(() => {
    if (blocks && tab > 0) {
      setBlock(blocks[tab - 1]?.lines.join('\n'));
    }
    setNewBlock(defaultNewVerseName);
  }, [tab, blocks]);

  const markDirty = () => setIsDirty(true);

  const saveSong = async () => {
    const newBlocks: TBlocks = {};
    blocks.forEach(({ name, lines }) => {
      newBlocks[name] = lines;
    });

    const updatedOrders = { ...orders, [currentOrder]: order };

    const newSong = new Song({
      songNumber: song?.songNumber ?? 0,
      title,
      authors,
      copyright,
      initialOrder: song?.initialOrder,
      order: updatedOrders,
      blocks: newBlocks,
    });

    try {
      if (newSong.songNumber > 0) {
        await updateSongMutation({
          songNumber: newSong.songNumber,
          title: newSong.title,
          authors: newSong.authors,
          copyright: newSong.copyright,
          initialOrder: newSong.initialOrder || [],
          order: newSong.order,
          blocks: newSong.blocks,
        }).unwrap();
        dispatch(updateSongInStore(newSong));
        trackEvent('song_updated', 'song', String(newSong.songNumber), { via: 'editor' });
      } else {
        const result = await createSongMutation({
          songNumber: 0,
          title: newSong.title,
          authors: newSong.authors,
          copyright: newSong.copyright,
          initialOrder: newSong.initialOrder || [],
          order: newSong.order,
          blocks: newSong.blocks,
        }).unwrap();
        const savedSong = new Song({ ...newSong, songNumber: result.songNumber });
        dispatch(addSongToStore(savedSong));
        trackEvent('song_created', 'song', String(result.songNumber), { via: 'editor' });
        onSongCreated?.(savedSong);
      }
      setIsDirty(false);
      setOpen(false);
    } catch (error) {
      console.error('Failed to save song:', error);
    }
  };

  /** Leave without saving. The draft is rebuilt from the song, so reopening starts clean. */
  const closeAndReset = () => {
    setOpen(false);
    init();
  };

  if (!song) {
    return null;
  }

  return (
    // Without an onClose the backdrop is inert — on a phone that leaves the ✕ as the only exit.
    <Drawer open={open} anchor="right" onClose={closeAndReset} slotProps={{ paper: { sx: { maxWidth: '100vw' } } }}>
      <Stack
        sx={{
          gap: 2,
          // A phone has no room to spare beside the drawer; wider screens keep the app visible
          // behind it. Below `md` the subtraction would go negative, which is what made the
          // editor unusable on mobile.
          width: { xs: '100vw', md: 'calc(100vw - 400px)' },
          maxWidth: '100vw',
          // The drawer is a fixed-height viewport: the content has to scroll inside it, or the
          // order editor and the save buttons sit below the fold with no way to reach them.
          height: '100%',
          overflowY: 'auto',
          padding: { xs: '12px 12px 16px', sm: '20px 25px' },
        }}
      >
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
          }}
        >
          <Typography variant={isMobile ? 'h6' : 'h4'} noWrap>
            {LL.SONG_EDITOR.TITLE()}
          </Typography>
          {isDirty && <Chip label="Unsaved" size="small" color="warning" sx={{ ml: 2 }} />}
          <Box
            sx={{
              flexGrow: 1,
            }}
          />
          <IconButton onClick={closeAndReset}>
            <CloseIcon />
          </IconButton>
        </Stack>

        <Stack
          sx={{
            gap: 1,
            padding: { xs: '8px', sm: '10px 15px' },
            bgcolor: 'background.paper',
          }}
        >
          <Tabs value={tab} onChange={(_, tab) => setTab(tab)} variant="scrollable" scrollButtons="auto">
            <Tab icon={<InfoIcon />} sx={{ minWidth: '50px' }} />
            {blocks.map(({ name }) => (
              <Tab key={name} label={name} />
            ))}
            <Tab icon={<AddIcon />} sx={{ minWidth: '50px' }} />
          </Tabs>

          {tab < 1 ? (
            <Stack
              sx={{
                gap: 1,
              }}
            >
              <Input
                value={title}
                onChange={({ target }) => {
                  setTitle(target.value);
                  markDirty();
                }}
                startAdornment={LL.COMMON.TITLE()}
                endAdornment={song.songNumber > 0 ? `# ${song.songNumber}` : undefined}
              />
              <Input
                value={authors}
                onChange={({ target }) => {
                  setAuthors(target.value);
                  markDirty();
                }}
                startAdornment={LL.COMMON.AUTHORS()}
              />
              <Input
                value={copyright}
                onChange={({ target }) => {
                  setCopyright(target.value);
                  markDirty();
                }}
                startAdornment={LL.COMMON.COPYRIGHT()}
              />
            </Stack>
          ) : tab <= blocks.length ? (
            // The block tools sit beside the lyrics on desktop; on a phone that column would eat
            // a third of the width, so they move underneath as a toolbar row instead.
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              sx={{
                gap: { xs: 1, sm: 2 },
              }}
            >
              <TextField
                multiline
                rows={isMobile ? 8 : 10}
                sx={{ flexGrow: 1, minWidth: 0 }}
                inputRef={inputRef}
                value={block}
                onChange={({ target }) => setBlock(target.value)}
                onBlur={() => {
                  _setBlocks(
                    blocks.map(({ name, lines }, i) => ({
                      name,
                      lines: i === tab - 1 ? block.trim().split('\n') : lines,
                    })),
                  );
                  markDirty();
                }}
              />
              <Stack
                direction={{ xs: 'row', sm: 'column' }}
                sx={{
                  gap: 1,
                  alignItems: 'center',
                }}
              >
                <IconButton
                  title={LL.COMMON.DELETE()}
                  onClick={(e) => {
                    e.stopPropagation();
                    const newBlocks = [...blocks];
                    if (tab > blocks.length - 1) setTab(tab - 1);
                    newBlocks.splice(tab - 1, 1);
                    setBlocks(newBlocks);
                  }}
                >
                  <DeleteIcon />
                </IconButton>
                <Box
                  sx={{
                    flexGrow: 1,
                  }}
                />
                <SpeedDialTranslate
                  title={LL.COMMON.LANGUAGE()}
                  ariaLabel="translation"
                  open={openTranslation}
                  direction="left"
                  onOpen={() => setOpenTranslation(true)}
                  onClose={() => setOpenTranslation(false)}
                  icon={<SpeedDialIcon icon={<TranslateIcon />} />}
                >
                  {languages.map((language) => (
                    <SpeedDialAction
                      key={language}
                      icon={<Typography color="secondary">{language}</Typography>}
                      onClick={() => {
                        setOpenTranslation(false);
                        const inputElement = inputRef.current;
                        if (inputElement) {
                          const cursorPosition = inputElement.selectionStart ?? 0;
                          setBlock(`${block.substring(0, cursorPosition)}\n[${language}] \n${block.substring(cursorPosition)}`);
                          setTimeout(() => {
                            inputElement.selectionStart = inputElement.selectionEnd = cursorPosition + 6;
                            inputElement.focus();
                          }, 0);
                        }
                      }}
                    />
                  ))}
                </SpeedDialTranslate>
                <IconButton
                  title={LL.COMMON.PAGE_BREAK()}
                  onClick={() => {
                    const inputElement = inputRef.current;
                    if (inputElement) {
                      const cursorPosition = inputElement.selectionStart ?? 0;
                      setBlock(
                        `${block.substring(0, cursorPosition)}\n${SONG_BLOCK_SEPARATOR}\n${block.substring(cursorPosition)}`.replace(
                          `${SONG_BLOCK_SEPARATOR}\n\n`,
                          `${SONG_BLOCK_SEPARATOR}\n`,
                        ),
                      );
                      setTimeout(() => {
                        inputElement.selectionStart = inputElement.selectionEnd = cursorPosition + 4;
                        inputElement.focus();
                      }, 0);
                    }
                  }}
                >
                  <PageBreakIcon />
                </IconButton>
              </Stack>
            </Stack>
          ) : (
            <Stack
              sx={{
                gap: 1,
              }}
            >
              <TextField value={newBlock} onChange={({ target }) => setNewBlock(target.value)} />
              <Button
                variant="contained"
                onClick={() => {
                  if (!blocks.find((block) => block.name === newBlock)) {
                    setBlocks([...blocks, { name: newBlock, lines: [] }]);
                  }
                }}
              >
                {LL.COMMON.ADD()}
              </Button>
            </Stack>
          )}
        </Stack>

        <Stack
          sx={{
            gap: 1,
            padding: { xs: '8px', sm: '10px 15px' },
            bgcolor: 'background.paper',
          }}
        >
          <SongOrderEditor
            orders={orders}
            currentOrder={currentOrder}
            order={order}
            availableBlocks={blocksOrder}
            selectedBlockName={tab > 0 && tab <= blocks.length ? blocks[tab - 1].name : undefined}
            onSelectBlock={(name) => {
              const blockIndex = blocks.findIndex((block) => block.name === name);
              if (blockIndex >= 0) {
                setTab(blockIndex + 1);
              }
            }}
            onChange={({ orders: nextOrders, currentOrder: nextCurrentOrder, order: nextOrder }) => {
              setOrders(nextOrders);
              setCurrentOrder(nextCurrentOrder);
              setOrder(nextOrder);
              markDirty();
            }}
          />
        </Stack>

        <Stack
          direction="row"
          sx={{
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Badge variant="dot" color="warning" invisible={!isDirty}>
            <Button variant="outlined" color="success" onClick={saveSong} startIcon={<SaveIcon />}>
              {LL.COMMON.APPLY()}
            </Button>
          </Badge>
          <Button variant="outlined" color="error" onClick={closeAndReset}>
            {LL.COMMON.CANCEL()}
          </Button>
        </Stack>
      </Stack>
    </Drawer>
  );
};
