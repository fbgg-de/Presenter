import { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import type { ISong } from '@/song';
import { SongOrderEditor } from './SongOrderEditor';

type QuickOrderDialogProps = {
  open: boolean;
  song: ISong;
  initialOrderName: string;
  onClose: () => void;
  onSave: (orderName: string, orders: Record<string, string[]>) => Promise<void> | void;
};

export const QuickOrderDialog = ({ open, song, initialOrderName, onClose, onSave }: QuickOrderDialogProps) => {
  const { LL } = useI18nContext();
  const [orders, setOrders] = useState<Record<string, string[]>>({ Default: [] });
  const [orderName, setOrderName] = useState('Default');
  const [order, setOrder] = useState<string[]>([]);
  const [selectedBlockName, setSelectedBlockName] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initialOrders =
      song.order && Object.keys(song.order).length > 0
        ? song.order
        : {
            Default: song.initialOrder ?? [],
          };
    const firstOrderName = Object.keys(initialOrders)[0] ?? 'Default';
    const selectedOrderName = initialOrders[initialOrderName] ? initialOrderName : firstOrderName;
    setOrders(initialOrders);
    setOrderName(selectedOrderName);
    setOrder(initialOrders[selectedOrderName] ?? []);
    setSelectedBlockName(undefined);
  }, [open, song.order, initialOrderName]);

  const canSave = orderName.trim().length > 0 && order.length > 0 && !isSaving;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      setIsSaving(true);
      const nextOrders = { ...orders, [orderName]: order };
      await onSave(orderName, nextOrders);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
    >
      <DialogTitle>{LL.MUSICIAN.ITEM_EDIT_ORDER()}</DialogTitle>
      <DialogContent>
        <SongOrderEditor
          orders={orders}
          currentOrder={orderName}
          order={order}
          availableBlocks={Object.keys(song.blocks ?? {})}
          selectedBlockName={selectedBlockName}
          onSelectBlock={(name) => setSelectedBlockName(name)}
          onChange={({ orders: nextOrders, currentOrder: nextCurrentOrder, order: nextOrder }) => {
            setOrders(nextOrders);
            setOrderName(nextCurrentOrder);
            setOrder(nextOrder);
            setSelectedBlockName((current) => (nextOrder.includes(current ?? '') ? current : undefined));
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{LL.COMMON.CANCEL()}</Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave}>
          {LL.COMMON.SAVE()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};






