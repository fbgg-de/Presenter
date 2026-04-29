import type { TextFieldProps, ZoomProps } from '@mui/material';
import { SpeedDialAction } from '@mui/material';
import {
  Zoom,
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
  Select,
  MenuItem,
  FormControl,
  Badge,
} from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppDispatch } from '@/store';
import AddOrderDialog from './AddOrderDialog';
import DeleteOrderDialog from './DeleteOrderDialog';
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
import type { PropsWithChildren, ReactNode } from 'react';
import { useRef, useEffect, useState } from 'react';
import { useCreateSongMutation, useUpdateSongMutation } from '@/api/songs.api';
import { addSongToStore, updateSongInStore } from '@/store/songsSlice';
import { useGetSettings } from '@/store/settingsSlice';

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

const SpeedDialBlock = styled(SpeedDial)`
  position: absolute;
  bottom: 0;
  right: 0;
  width: 32px;
  & .MuiFab-root {
    width: 32px;
    height: 32px;
    min-height: 32px;
  }
  & .MuiSpeedDial-actions {
    white-space: nowrap;
  }
`;

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

const Animation = (props: PropsWithChildren<ZoomProps & { key?: number | string; delay: number }>) => (
  <Zoom key={props.key} in={props.in} timeout={300} style={{ transitionDelay: `${props.delay}ms` }}>
    {props.children}
  </Zoom>
);

const AddBlock = (props: { order: string[]; index: number; selected: number; onSelect: (name: string, index: number) => void }) => {
  const { order, index, selected, onSelect } = props;
  const [open, setOpen] = useState(false);

  return (
    <Box sx={{ height: 32, width: 32, position: 'relative', zIndex: 9999 }}>
      <SpeedDialBlock
        open={open}
        onClose={() => setOpen(false)}
        onClick={() => setOpen(!open)}
        ariaLabel="add block"
        icon={<SpeedDialIcon icon={<AddIcon />} />}
      >
        {order.map((order, i) => (
          <Animation key={order} in={open} timeout={300} delay={i * 30}>
            <Button
              variant="contained"
              color={i === selected ? 'secondary' : 'primary'}
              sx={{ margin: '2px' }}
              onClick={() => onSelect(order, index)}
            >
              {order}
            </Button>
          </Animation>
        ))}
      </SpeedDialBlock>
    </Box>
  );
};

type Block = { name: string; lines: string[] };

export const SongEditor = (props: { open: boolean; setOpen: (open: boolean) => void; song?: ISong }) => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const { defaultNewVerseName } = useGetSettings();

  const [createSongMutation] = useCreateSongMutation();
  const [updateSongMutation] = useUpdateSongMutation();

  const { open, setOpen, song } = props;

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

  const [openAddOrderDialog, setOpenAddOrderDialog] = useState(false);
  const [openDeleteOrderDialog, setOpenDeleteOrderDialog] = useState(false);

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
      }
      setIsDirty(false);
      setOpen(false);
    } catch (error) {
      console.error('Failed to save song:', error);
    }
  };

  if (!song) {
    return null;
  }

  return (
    <Drawer open={open} anchor="right">
      <AddOrderDialog
        open={openAddOrderDialog}
        onClose={() => setOpenAddOrderDialog(false)}
        orders={orders}
        onCreate={(name) => {
          const updatedOrders = { ...orders, [currentOrder]: [...order], [name]: [...order] };
          setOrders(updatedOrders);
          setCurrentOrder(name);
          setOrder([...order]);
          setOpenAddOrderDialog(false);
          markDirty();
        }}
      />
      <DeleteOrderDialog
        open={openDeleteOrderDialog}
        onClose={() => setOpenDeleteOrderDialog(false)}
        orderName={currentOrder}
        onDelete={() => {
          const updatedOrders = { ...orders };
          delete updatedOrders[currentOrder];
          setOrders(updatedOrders);
          const firstOrd = Object.keys(updatedOrders)[0];
          setCurrentOrder(firstOrd);
          setOrder(updatedOrders[firstOrd] ?? []);
          setOpenDeleteOrderDialog(false);
          markDirty();
        }}
      />
      <Stack
        sx={{
          gap: 2,
          width: 'calc(100vw - 400px)',
          padding: '20px 25px',
        }}
      >
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
          }}
        >
          <Typography variant="h4">{LL.SONG_EDITOR.TITLE()}</Typography>
          {isDirty && <Chip label="Unsaved" size="small" color="warning" sx={{ ml: 2 }} />}
          <Box
            sx={{
              flexGrow: 1,
            }}
          />
          <IconButton
            onClick={() => {
              setOpen(false);
              init();
            }}
          >
            <CloseIcon />
          </IconButton>
        </Stack>

        <Stack
          sx={{
            gap: 2,
            padding: '10px 15px',
            minHeight: 350,
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
            <Stack
              direction="row"
              sx={{
                gap: 2,
              }}
            >
              <TextField
                multiline
                rows={10}
                sx={{ flexGrow: 1 }}
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
                sx={{
                  gap: 1,
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
            padding: '10px 15px',
            bgcolor: 'background.paper',
          }}
        >
          <Stack
            direction="row"
            sx={{
              gap: 1,
              alignItems: 'center',
              mb: 1,
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{
                color: 'text.secondary',
              }}
            >
              Order:
            </Typography>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <Select
                value={currentOrder}
                onChange={(e) => {
                  const updatedOrders = { ...orders, [currentOrder]: order };
                  setOrders(updatedOrders);
                  const newOrder = e.target.value;
                  setCurrentOrder(newOrder);
                  setOrder(updatedOrders[newOrder] ?? []);
                }}
                sx={{ fontSize: '0.875rem' }}
              >
                {Object.keys(orders).map((ord) => (
                  <MenuItem key={ord} value={ord}>
                    {ord}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <IconButton size="small" onClick={() => setOpenAddOrderDialog(true)} title="Add new order">
              <AddIcon fontSize="small" />
            </IconButton>
            {Object.keys(orders).length > 1 && (
              <IconButton size="small" onClick={() => setOpenDeleteOrderDialog(true)} title="Delete current order">
                <DeleteIcon fontSize="small" />
              </IconButton>
            )}
          </Stack>

          <Stack
            direction="row"
            sx={{
              gap: 1,
              flexWrap: 'wrap',
            }}
          >
            <AddBlock
              index={0}
              order={blocksOrder}
              selected={tab - 1}
              onSelect={(name) => {
                setOrder([name, ...order]);
                markDirty();
              }}
            />
            {order.map((name, i) => [
              <Chip
                key={i}
                label={name}
                color={tab > 0 && tab <= blocks.length && blocks[tab - 1].name === name ? 'secondary' : 'default'}
                onClick={() => setTab(blocks.findIndex((block) => block.name === name) + 1)}
                {...(order.length > 1 && {
                  onDelete: () => {
                    setOrder(order.filter((_, j) => i !== j));
                    markDirty();
                  },
                })}
              />,
              <AddBlock
                key={`add-${i}`}
                index={i + 1}
                order={blocksOrder}
                selected={tab - 1}
                onSelect={(name) => {
                  setOrder([...order.slice(0, i + 1), name, ...order.slice(i + 1)]);
                  markDirty();
                }}
              />,
            ])}
          </Stack>
        </Stack>

        <Stack
          direction="row"
          sx={{
            gap: 2,
          }}
        >
          <Badge variant="dot" color="warning" invisible={!isDirty}>
            <Button variant="outlined" color="success" onClick={saveSong} startIcon={<SaveIcon />}>
              {LL.COMMON.APPLY()}
            </Button>
          </Badge>
          <Button
            variant="outlined"
            color="error"
            onClick={() => {
              setOpen(false);
              init();
            }}
          >
            {LL.COMMON.CANCEL()}
          </Button>
        </Stack>
      </Stack>
    </Drawer>
  );
};
