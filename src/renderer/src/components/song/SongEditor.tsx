import { useEffect, useMemo, useState, ReactNode } from 'react';
import {
  Button,
  Chip,
  Box,
  Divider,
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
  TextFieldProps,
} from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppDispatch } from '@/store';
import { SongOrderEditor } from './SongOrderEditor';
import { LyricBlockEditor } from './LyricBlockEditor';
import { SongLanguagesEditor } from './SongLanguagesEditor';
import { Close as CloseIcon, Delete as DeleteIcon, Info as InfoIcon, Add as AddIcon, Save as SaveIcon } from '@mui/icons-material';
import type { ISong, LyricEffect, LyricPage, TBlocks } from '@/song';
import {
  PRIMARY_LANGUAGE_KEY,
  Song,
  applyLyricEffects,
  countLinesWithLanguage,
  parseBlockLines,
  resolvePrimaryLanguage,
  seedSongLanguages,
  serialiseBlockLines,
} from '@/song';
import { useCreateSongMutation, useUpdateSongMutation } from '@/api/songs.api';
import { addSongToStore, updateSongInStore } from '@/store/songsSlice';
import { useGetSettings } from '@/store/settingsSlice';
import { useAccountLanguages } from '@/hooks/useAccountLanguages';
import { useMetrics } from '@/hooks/useMetrics';
import { useIsMobile } from '@/hooks/useIsMobile';

/** A block as the editor holds it: lyrics stay parsed until save. */
type Block = { name: string; pages: LyricPage[] };

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
  const { available: accountLanguages, defaultLanguage } = useAccountLanguages();

  const [createSongMutation] = useCreateSongMutation();
  const [updateSongMutation] = useUpdateSongMutation();
  const { trackEvent } = useMetrics();

  const { open, setOpen, song, onSongCreated } = props;

  const [isDirty, setIsDirty] = useState(false);

  const [tab, setTab] = useState(0);
  const [blocks, _setBlocks] = useState<Block[]>([]);
  const [blocksOrder, setBlocksOrder] = useState<string[]>([]);

  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [copyright, setCopyright] = useState('');
  const [languages, setLanguages] = useState<string[]>([]);
  /** Which languages the lyric editor shows. A view filter, reset whenever the list changes. */
  const [visibleLanguages, setVisibleLanguages] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [orders, setOrders] = useState<{ [key: string]: string[] }>({ Default: [] });
  const [currentOrder, setCurrentOrder] = useState<string>('Default');
  const [newBlock, setNewBlock] = useState('');

  const markDirty = () => setIsDirty(true);

  /** Adding or removing a block re-sorts the tabs and drops the block from every order. */
  const setBlocks = (next: Block[]) => {
    next.sort((a, b) => a.name.localeCompare(b.name));
    _setBlocks(next);
    setBlocksOrder(next.map((block) => block.name));
    setOrder(order.filter((name) => !!next.find((block) => block.name === name)));
    markDirty();
  };

  const init = () => {
    if (!song) return;

    setTab(0);
    setIsDirty(false);

    // Songs stored before the language list existed are read back off their own tags.
    const stored = song.languages ?? [];
    const seeded = stored.length > 0 ? stored : seedSongLanguages(song.blocks, [defaultLanguage, ...accountLanguages]);

    // Which language actually anchors the lyric lines. Normally the first of the list, but a
    // song whose list has drifted from its content would otherwise open with an empty first
    // column and every line in the translation slots, so the content wins and the list follows.
    const allLines = Object.values(song.blocks).flat();
    const anchor = resolvePrimaryLanguage(allLines, seeded[0]);
    const languages = anchor && seeded[0] !== anchor ? [anchor, ...seeded.filter((code) => code !== anchor)] : seeded;

    const parsed: Block[] = [];
    const push = (name: string, lines: string[]) => parsed.push({ name, pages: parseBlockLines(lines, anchor) });

    if (song.initialOrder && song.initialOrder.length > 0) {
      song.initialOrder.forEach((blockName) => {
        if (song.blocks[blockName]) push(blockName, song.blocks[blockName]);
      });
      for (const [name, lines] of Object.entries(song.blocks)) {
        if (!song.initialOrder.includes(name)) push(name, lines);
      }
    } else {
      for (const [name, lines] of Object.entries(song.blocks)) push(name, lines);
    }

    _setBlocks(parsed);
    setBlocksOrder(parsed.map((block) => block.name));

    setTitle(song.title);
    setAuthors(song.authors ?? '');
    setCopyright(song.copyright ?? '');

    setLanguages(languages);
    setVisibleLanguages(languages);

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
  };

  useEffect(() => {
    init();
  }, [song]);

  /** How many lyric lines carry text per language, for the removal warning in the info tab. */
  const languageUsage = useMemo(() => {
    const usage: Record<string, number> = {};

    languages.forEach((code, index) => {
      const key = index === 0 ? PRIMARY_LANGUAGE_KEY : code;
      usage[code] = blocks.reduce((total, block) => total + countLinesWithLanguage(block.pages, key), 0);
    });

    return usage;
  }, [blocks, languages]);

  /**
   * A change to the language list can imply a rewrite of every block — promoting a language to
   * default moves it into the untagged slot, and removing one deletes its text.
   */
  const handleLanguagesChange = (next: string[], effects: LyricEffect[]) => {
    if (effects.length > 0) {
      _setBlocks(blocks.map((block) => ({ ...block, pages: applyLyricEffects(block.pages, effects) })));
    }

    setLanguages(next);
    setVisibleLanguages((visible) => {
      const kept = visible.filter((code) => next.includes(code));
      const added = next.filter((code) => !visible.includes(code));

      // New languages start visible; a filter that would hide everything falls back to all.
      const merged = [...kept, ...added];
      return merged.length > 0 ? next.filter((code) => merged.includes(code)) : next;
    });
    markDirty();
  };

  const setBlockPages = (index: number, pages: LyricPage[]) => {
    _setBlocks(blocks.map((block, i) => (i === index ? { ...block, pages } : block)));
    markDirty();
  };

  const saveSong = async () => {
    const newBlocks: TBlocks = {};
    blocks.forEach(({ name, pages }) => {
      newBlocks[name] = serialiseBlockLines(pages, languages);
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
      languages,
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
          languages,
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
          languages,
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

  const activeBlockIndex = tab > 0 && tab <= blocks.length ? tab - 1 : -1;

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
          {isDirty && <Chip label={LL.SONG_EDITOR.UNSAVED()} size="small" color="warning" sx={{ ml: 2 }} />}
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
          <Tabs
            value={tab}
            onChange={(_, next) => {
              setTab(next);
              // The add-block tab starts from the configured default every time it is opened.
              if (next > blocks.length) setNewBlock(defaultNewVerseName);
            }}
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab icon={<InfoIcon />} sx={{ minWidth: '50px' }} />
            {blocks.map(({ name }) => (
              <Tab key={name} label={name} />
            ))}
            <Tab icon={<AddIcon />} sx={{ minWidth: '50px' }} />
          </Tabs>

          {tab < 1 ? (
            <Stack
              sx={{
                gap: 2,
              }}
            >
              <Stack sx={{ gap: 1 }}>
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

              <Divider />

              <SongLanguagesEditor
                languages={languages}
                available={accountLanguages}
                usage={languageUsage}
                onChange={handleLanguagesChange}
              />
            </Stack>
          ) : activeBlockIndex >= 0 ? (
            <Stack sx={{ gap: 1 }}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle2" color="text.secondary" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
                  {blocks[activeBlockIndex].name}
                </Typography>
                <IconButton
                  title={LL.SONG_EDITOR.DELETE_BLOCK()}
                  color="error"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = [...blocks];
                    if (tab > blocks.length - 1) setTab(tab - 1);
                    next.splice(activeBlockIndex, 1);
                    setBlocks(next);
                  }}
                >
                  <DeleteIcon />
                </IconButton>
              </Stack>

              <LyricBlockEditor
                pages={blocks[activeBlockIndex].pages}
                languages={languages}
                visibleLanguages={visibleLanguages}
                onVisibleLanguagesChange={setVisibleLanguages}
                onChange={(pages) => setBlockPages(activeBlockIndex, pages)}
              />
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
                    setBlocks([...blocks, { name: newBlock, pages: parseBlockLines([]) }]);
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
            selectedBlockName={activeBlockIndex >= 0 ? blocks[activeBlockIndex].name : undefined}
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
