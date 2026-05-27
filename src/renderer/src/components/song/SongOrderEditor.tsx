import { useState, PropsWithChildren } from 'react';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import {
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  SpeedDial,
  SpeedDialIcon,
  Stack,
  Typography,
  Zoom,
  styled,
} from '@mui/material';
import type { ZoomProps } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { useI18nContext } from '@/i18n/i18n-react';
import AddOrderDialog from './AddOrderDialog';
import DeleteOrderDialog from './DeleteOrderDialog';

type SongOrderEditorProps = {
  orders: { [key: string]: string[] };
  currentOrder: string;
  order: string[];
  availableBlocks: string[];
  selectedBlockName?: string;
  onSelectBlock?: (name: string, index: number) => void;
  onChange: (next: { orders: { [key: string]: string[] }; currentOrder: string; order: string[] }) => void;
  showOrderControls?: boolean;
  centerChips?: boolean;
  activeChipColor?: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
  inactiveChipSx?: SxProps<Theme>;
  selectedOrderIndex?: number;
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

const Animation = (props: PropsWithChildren<ZoomProps & { key?: number | string; delay: number }>) => (
  <Zoom key={props.key} in={props.in} timeout={300} style={{ transitionDelay: `${props.delay}ms` }}>
    {props.children}
  </Zoom>
);

const AddBlock = (props: {
  options: string[];
  index: number;
  selectedBlockName?: string;
  onSelect: (name: string, index: number) => void;
}) => {
  const { options, index, selectedBlockName, onSelect } = props;
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
        {options.map((blockName, i) => (
          <Animation key={`${blockName}-${index}-${i}`} in={open} timeout={300} delay={i * 30}>
            <Button
              variant="contained"
              color={blockName === selectedBlockName ? 'secondary' : 'primary'}
              sx={{ margin: '2px' }}
              onClick={() => onSelect(blockName, index)}
            >
              {blockName}
            </Button>
          </Animation>
        ))}
      </SpeedDialBlock>
    </Box>
  );
};

export const SongOrderEditor = ({
  orders,
  currentOrder,
  order,
  availableBlocks,
  selectedBlockName,
  onSelectBlock,
  onChange,
  showOrderControls = true,
  centerChips = false,
  activeChipColor = 'secondary',
  inactiveChipSx,
  selectedOrderIndex,
}: SongOrderEditorProps) => {
  const { LL } = useI18nContext();
  const [openAddOrderDialog, setOpenAddOrderDialog] = useState(false);
  const [openDeleteOrderDialog, setOpenDeleteOrderDialog] = useState(false);

  return (
    <>
      <AddOrderDialog
        open={openAddOrderDialog}
        onClose={() => setOpenAddOrderDialog(false)}
        orders={orders}
        onCreate={(name) => {
          const updatedOrders = { ...orders, [currentOrder]: [...order], [name]: [...order] };
          onChange({ orders: updatedOrders, currentOrder: name, order: [...order] });
          setOpenAddOrderDialog(false);
        }}
      />
      <DeleteOrderDialog
        open={openDeleteOrderDialog}
        onClose={() => setOpenDeleteOrderDialog(false)}
        orderName={currentOrder}
        onDelete={() => {
          const updatedOrders = { ...orders };
          delete updatedOrders[currentOrder];
          const firstOrd = Object.keys(updatedOrders)[0] ?? 'Default';
          const firstOrderValue = updatedOrders[firstOrd] ?? [];
          onChange({ orders: updatedOrders, currentOrder: firstOrd, order: firstOrderValue });
          setOpenDeleteOrderDialog(false);
        }}
      />

      {showOrderControls && (
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
                const updatedOrders = { ...orders, [currentOrder]: [...order] };
                const newOrder = e.target.value;
                onChange({ orders: updatedOrders, currentOrder: newOrder, order: updatedOrders[newOrder] ?? [] });
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
          <IconButton size="small" onClick={() => setOpenAddOrderDialog(true)} title={LL.SONG_EDITOR.ADD_ORDER_TITLE()}>
            <AddIcon fontSize="small" />
          </IconButton>
          {Object.keys(orders).length > 1 && (
            <IconButton size="small" onClick={() => setOpenDeleteOrderDialog(true)} title={LL.SONG_EDITOR.DELETE_ORDER_TITLE()}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      )}

      <Stack
        direction="row"
        sx={{
          gap: 1,
          flexWrap: 'wrap',
          justifyContent: centerChips ? 'center' : 'flex-start',
        }}
      >
        {order.map((name, i) => (
          <Box
            key={`${name}-${i}`}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <AddBlock
              index={i}
              options={availableBlocks}
              selectedBlockName={selectedBlockName}
              onSelect={(blockName) => {
                onChange({ orders, currentOrder, order: [...order.slice(0, i), blockName, ...order.slice(i)] });
              }}
            />
            <Box sx={{ position: 'relative', display: 'inline-flex' }}>
              <Chip
                label={name}
                color={selectedOrderIndex === i ? 'warning' : selectedBlockName === name ? activeChipColor : 'default'}
                onClick={() => onSelectBlock?.(name, i)}
                sx={selectedBlockName === name ? undefined : inactiveChipSx}
                {...(order.length > 1 && {
                  onDelete: () => {
                    onChange({ orders, currentOrder, order: order.filter((_, j) => i !== j) });
                  },
                })}
              />
            </Box>
          </Box>
        ))}
        <AddBlock
          index={order.length}
          options={availableBlocks}
          selectedBlockName={selectedBlockName}
          onSelect={(name) => onChange({ orders, currentOrder, order: [...order, name] })}
        />
      </Stack>
    </>
  );
};
