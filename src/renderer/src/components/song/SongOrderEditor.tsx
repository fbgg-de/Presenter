import { useState } from 'react';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { Box, Button, Chip, Fab, FormControl, IconButton, MenuItem, Popover, Select, Stack, Typography } from '@mui/material';
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

const AddBlock = (props: {
  options: string[];
  index: number;
  selectedBlockName?: string;
  onSelect: (name: string, index: number) => void;
}) => {
  const { options, index, selectedBlockName, onSelect } = props;
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  return (
    <Box sx={{ height: 32, width: 32, position: 'relative', zIndex: 9999 }}>
      <Fab
        size="small"
        color="primary"
        aria-label="add block"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{ width: 32, height: 32, minHeight: 32 }}
      >
        <AddIcon fontSize="small" />
      </Fab>
      <Popover
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.max(1, Math.ceil(options.length / 8))}, 1fr)`,
            p: 1,
            gap: 0.5,
          }}
        >
          {options.map((blockName, i) => (
            <Button
              key={`${blockName}-${i}`}
              variant="contained"
              size="small"
              color={blockName === selectedBlockName ? 'secondary' : 'primary'}
              onClick={() => {
                onSelect(blockName, index);
                setAnchorEl(null);
              }}
            >
              {blockName}
            </Button>
          ))}
        </Box>
      </Popover>
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
          columnGap: 1,
          // Narrow screens wrap the order into (nearly) one chip per row — the default
          // gap then stacks up into a very tall block, so tighten the vertical rhythm.
          rowGap: { xs: 0.25, sm: 1 },
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
