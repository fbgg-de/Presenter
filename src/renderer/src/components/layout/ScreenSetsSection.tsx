/**
 * Screen sets under the screen group board: named shortcuts for several groups ("LED wall" = LED
 * left + LED right). A set is only a shortcut — it shows up as one chip wherever a media entry
 * chooses its screens; every group keeps its own framing and settings.
 */
import { useEffect, useState } from 'react';
import { Alert, Button, Chip, IconButton, Paper, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { DeleteOutlined as DeleteIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetScreenGroupsQuery } from '@/api/screenGroups.api';
import {
  useCreateScreenSetMutation,
  useDeleteScreenSetMutation,
  useGetScreenSetsQuery,
  useUpdateScreenSetMutation,
  type ScreenSetEntity,
} from '@/api/screenSets.api';

const SetName = ({ set, onCommit }: { set: ScreenSetEntity; onCommit: (name: string) => void }) => {
  const [draft, setDraft] = useState(set.name);
  useEffect(() => setDraft(set.name), [set.name]);
  return (
    <TextField
      size="small"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() && draft.trim() !== set.name) onCommit(draft.trim());
        else setDraft(set.name);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      sx={{ width: 180, '& input': { py: 0.5, fontWeight: 600 } }}
    />
  );
};

export const ScreenSetsSection = () => {
  const { LL } = useI18nContext();
  const S = LL.SCREEN_SET;
  const { data: groups = [] } = useGetScreenGroupsQuery();
  const { data: sets = [] } = useGetScreenSetsQuery();
  const [createSet] = useCreateScreenSetMutation();
  const [updateSet] = useUpdateScreenSetMutation();
  const [deleteSet] = useDeleteScreenSetMutation();
  const [failed, setFailed] = useState(false);

  const run = async (request: Promise<unknown>) => {
    try {
      await request;
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };

  const add = () => {
    const taken = new Set(sets.map((s) => s.name));
    let name: string = S.DEFAULT_NAME();
    for (let n = 2; taken.has(name); n++) name = `${S.DEFAULT_NAME()} ${n}`;
    void run(createSet({ name, screenGroupIds: [] }).unwrap());
  };

  return (
    <Stack spacing={1} sx={{ borderTop: 1, borderColor: 'divider', pt: 1.5 }}>
      <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {S.TITLE()}
        </Typography>
        <Button size="small" color="inherit" onClick={add} disabled={groups.length < 2} sx={{ textTransform: 'none' }}>
          + {S.ADD()}
        </Button>
      </Stack>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {S.HINT()}
      </Typography>
      {failed && (
        <Alert severity="error" onClose={() => setFailed(false)}>
          {S.SAVE_FAILED()}
        </Alert>
      )}
      {sets.map((set) => (
        <Paper key={set.id} variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <SetName set={set} onCommit={(name) => void run(updateSet({ id: set.id, name }).unwrap())} />
            {groups.map((group) => {
              const on = set.screenGroupIds.includes(group.id);
              return (
                <Chip
                  key={group.id}
                  size="small"
                  label={group.name}
                  color={on ? 'primary' : 'default'}
                  variant={on ? 'filled' : 'outlined'}
                  onClick={() =>
                    void run(
                      updateSet({
                        id: set.id,
                        screenGroupIds: on ? set.screenGroupIds.filter((id) => id !== group.id) : [...set.screenGroupIds, group.id],
                      }).unwrap(),
                    )
                  }
                />
              );
            })}
            <Tooltip title={S.DELETE()}>
              <IconButton size="small" onClick={() => void run(deleteSet({ id: set.id }).unwrap())} sx={{ ml: 'auto' }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
};
