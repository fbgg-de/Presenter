import { useState } from 'react';
import { AppBar, IconButton, Toolbar, Typography, Box, Tooltip, Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import {
  LightMode,
  DarkMode,
  SettingsBrightness,
  AccountCircle as AccountCircleIcon,
  AdminPanelSettings as AdminIcon,
  Logout as LogoutIcon,
  Info as InfoIcon,
  Cable as CableIcon,
  PictureAsPdf as PdfIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { toggleTheme } from '@/store/themeSlice';
import { updateSetting } from '@/store/settingsSlice';
import { useGetSessionQuery, useLogoutMutation } from '@/api/session.api';
import { StyleEditor } from '@/components/StyleEditor';
import { StyleInspector } from '@/components/StyleInspector';
import { CompanionHelper } from '@/components/CompanionHelper';

const Header = () => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const themeMode = useAppSelector((state) => state.theme.mode);
  const uiLanguage = useAppSelector((state) => state.settings.uiLanguage);

  const { data: session } = useGetSessionQuery();
  const [logout] = useLogoutMutation();

  // Language menu
  const [langAnchorEl, setLangAnchorEl] = useState<null | HTMLElement>(null);
  const langMenuOpen = Boolean(langAnchorEl);

  // Account menu
  const [accountAnchorEl, setAccountAnchorEl] = useState<null | HTMLElement>(null);
  const accountMenuOpen = Boolean(accountAnchorEl);

  // Style editor (kept for inspector → editor wiring) and inspector
  const [styleEditorOpen, setStyleEditorOpen] = useState(false);
  const [styleInspectorOpen, setStyleInspectorOpen] = useState(false);
  const [editStyleId, setEditStyleId] = useState<number | undefined>(undefined);
  const [companionHelperOpen, setCompanionHelperOpen] = useState(false);

  const themeIcon = themeMode === 'dark' ? <DarkMode /> : themeMode === 'light' ? <LightMode /> : <SettingsBrightness />;
  const themeLabel = themeMode === 'dark' ? 'Dark' : themeMode === 'light' ? 'Light' : 'System';

  const currentLangLabel = uiLanguage === 'de' ? '🇩🇪' : '🇬🇧';

  const handleLanguageChange = (lang: string) => {
    dispatch(updateSetting({ key: 'uiLanguage', value: lang }));
    setLangAnchorEl(null);
  };

  const handleLogout = async () => {
    setAccountAnchorEl(null);
    try {
      await logout().unwrap();
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  };

  return (
    <>
      <AppBar position="static" color="default" elevation={1} sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar variant="dense" sx={{ minHeight: 48 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mr: 2 }}>
            {LL.COMMON.APP_NAME()}
          </Typography>
          <Box flexGrow={1} />

          {/* Language Switcher */}
          <Tooltip title={LL.HEADER.SWITCH_LANGUAGE()}>
            <IconButton size="small" onClick={(e) => setLangAnchorEl(e.currentTarget)} sx={{ mr: 0.5 }}>
              <Typography variant="body2" sx={{ fontSize: '1.1rem', lineHeight: 1 }}>
                {currentLangLabel}
              </Typography>
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={langAnchorEl}
            open={langMenuOpen}
            onClose={() => setLangAnchorEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem onClick={() => handleLanguageChange('en')} selected={uiLanguage === 'en' || uiLanguage === ''}>
              <ListItemIcon>
                <Typography>🇬🇧</Typography>
              </ListItemIcon>
              <ListItemText>{LL.HEADER.LANGUAGE_EN()}</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleLanguageChange('de')} selected={uiLanguage === 'de'}>
              <ListItemIcon>
                <Typography>🇩🇪</Typography>
              </ListItemIcon>
              <ListItemText>{LL.HEADER.LANGUAGE_DE()}</ListItemText>
            </MenuItem>
          </Menu>

          {/* Theme Toggle */}
          <Tooltip title={`Theme: ${themeLabel}`}>
            <IconButton size="small" onClick={() => dispatch(toggleTheme())} sx={{ mr: 0.5 }}>
              {themeIcon}
            </IconButton>
          </Tooltip>

          {/* Style Inspector */}
          <Tooltip title={LL.STYLE.INSPECTOR()}>
            <IconButton size="small" onClick={() => setStyleInspectorOpen(true)} sx={{ mr: 0.5 }}>
              <InfoIcon />
            </IconButton>
          </Tooltip>

          {/* Musician View */}
          <Tooltip title={LL.MUSICIAN.OPEN()}>
            <IconButton size="small" onClick={() => window.open('/notes', '_blank')} sx={{ mr: 0.5 }}>
              <PdfIcon />
            </IconButton>
          </Tooltip>

          {/* Companion Helper */}
          <Tooltip title={LL.COMPANION.HELPER_TITLE()}>
            <IconButton size="small" onClick={() => setCompanionHelperOpen(true)} sx={{ mr: 0.5 }}>
              <CableIcon />
            </IconButton>
          </Tooltip>

          {/* Account Menu */}
          <Tooltip title={LL.HEADER.ACCOUNT_MENU()}>
            <IconButton size="small" onClick={(e) => setAccountAnchorEl(e.currentTarget)}>
              <AccountCircleIcon />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={accountAnchorEl}
            open={accountMenuOpen}
            onClose={() => setAccountAnchorEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            {session?.mail && (
              <MenuItem disabled>
                <ListItemText>
                  <Typography variant="body2" color="text.secondary">
                    {LL.AUTH.LOGGED_IN_AS()}
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {session.mail}
                  </Typography>
                </ListItemText>
              </MenuItem>
            )}
            {session?.mail && <Divider />}
            {session?.authType === 'oidc_admin' && (
              <MenuItem
                onClick={() => {
                  setAccountAnchorEl(null);
                  navigate('/admin');
                }}
              >
                <ListItemIcon>
                  <AdminIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{LL.HEADER.ADMIN_DASHBOARD()}</ListItemText>
              </MenuItem>
            )}
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>{LL.AUTH.LOGOUT()}</ListItemText>
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Style Editor Drawer (opened by the Inspector's "edit" action) */}
      <StyleEditor open={styleEditorOpen} onClose={() => setStyleEditorOpen(false)} editStyleId={editStyleId} />

      {/* Style Inspector Dialog */}
      <StyleInspector
        open={styleInspectorOpen}
        onClose={() => setStyleInspectorOpen(false)}
        onEditStyle={(id) => {
          setStyleInspectorOpen(false);
          setEditStyleId(id);
          setStyleEditorOpen(true);
        }}
      />


      {/* Companion Helper */}
      <CompanionHelper open={companionHelperOpen} onClose={() => setCompanionHelperOpen(false)} />
    </>
  );
};

export default Header;
