import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Gavel,
  Play,
  Pause,
  SkipForward,
  Undo2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  Trash2,
  Edit3,
  RefreshCw,
  Upload,
  Download,
  ArrowUp,
  ArrowDown,
  Lock,
  Unlock,
  Eye,
  Users,
  Layers,
  Settings,
  History,
  Award,
  ArrowRightLeft,
  Coins,
  Image as ImageIcon,
  Search,
  X,
  GripVertical,
  Shuffle,
  Zap,
  FolderPlus,
  Camera,
  Trophy,
  Moon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useAuctionSocket } from '../hooks/useAuctionSocket.js';
import {
  VistaHeader,
  TeamLogo,
  ItemImage,
  StatusBadge,
  OverseasPlane
} from '../components/Common.jsx';
import {
  AUCTION_STATES,
  PREDEFINED_CURRENCIES,
  BUILTIN_LOGOS,
  formatCurrency,
  parseCurrencyInput,
  isIplAuction,
  getTeamOverseasCount
} from '../../shared/constants.js';
import {
  exportAuctionResults,
  parseSpreadsheetItems,
  downloadImportTemplate
} from '../utils/exportData.js';

export default function CommitteeAdminDashboard() {
  const { auctionId } = useParams();
  const navigate = useNavigate();
  const { user, apiFetch } = useAuth();
  const { auction, setAuction, connected, loading, error, broadcastLiveEvent } = useAuctionSocket(auctionId);

  const [activeTab, setActiveTab] = useState('CONTROL');
  const [toast, setToast] = useState(null);
  const [busyAction, setBusyAction] = useState(false);

  // Control Desk State
  const [selectedBidTeamId, setSelectedBidTeamId] = useState('');
  const [showEditBidModal, setShowEditBidModal] = useState(false);
  const [manualBidTeamId, setManualBidTeamId] = useState('');
  const [manualBidInput, setManualBidInput] = useState('');
  const [manualBidOverride, setManualBidOverride] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);

  // RTM (Right To Match) Live Sale Modal State
  const [showRtmModal, setShowRtmModal] = useState(false);
  const [rtmTeamId, setRtmTeamId] = useState('');
  const [rtmAmountInput, setRtmAmountInput] = useState('');

  // Add Item State
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemPool, setNewItemPool] = useState('');
  const [newItemQueuePos, setNewItemQueuePos] = useState('');
  const [itemFilterPool, setItemFilterPool] = useState('ALL');
  const [itemFilterStatus, setItemFilterStatus] = useState('ALL');
  const [itemSearch, setItemSearch] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [reauctionModalItem, setReauctionModalItem] = useState(null);
  const [reauctionPriceInput, setReauctionPriceInput] = useState('');
  const fileInputRef = useRef(null);

  // Drag & Drop Queue state
  const [draggedQueueIndex, setDraggedQueueIndex] = useState(null);

  // Purchase Transfer Modal State
  const [transferModalItem, setTransferModalItem] = useState(null);
  const [transferTargetTeamId, setTransferTargetTeamId] = useState('');
  const [transferAmountInput, setTransferAmountInput] = useState('');

  // Retention & RTM Limits State (with Drag-and-Drop + Set Price)
  const [retTeamId, setRetTeamId] = useState('');
  const [retPlayerName, setRetPlayerName] = useState('');
  const [retAmountInput, setRetAmountInput] = useState('');
  const [editingRetention, setEditingRetention] = useState(null);
  const [maxRtmConfigInput, setMaxRtmConfigInput] = useState('');
  const [maxRetConfigInput, setMaxRetConfigInput] = useState('');
  const [retPoolSearch, setRetPoolSearch] = useState('');
  const [draggedRetPayload, setDraggedRetPayload] = useState(null);
  const [dragOverTeamId, setDragOverTeamId] = useState(null);
  const [retentionPriceModal, setRetentionPriceModal] = useState(null);

  // Team Management State
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamCode, setNewTeamCode] = useState('');
  const [newTeamPin, setNewTeamPin] = useState('');
  const [newTeamPrimary, setNewTeamPrimary] = useState('#034694');
  const [newTeamSecondary, setNewTeamSecondary] = useState('#DBA111');
  const [newTeamRtmCards, setNewTeamRtmCards] = useState('');
  const [newTeamLogo, setNewTeamLogo] = useState('');
  const [editingTeam, setEditingTeam] = useState(null);
  const [purseModalTeam, setPurseModalTeam] = useState(null);
  const [purseAdjType, setPurseAdjType] = useState('ADD');
  const [purseAdjAmount, setPurseAdjAmount] = useState('');
  const [purseAdjReason, setPurseAdjReason] = useState('');

  // Pool Sets & Increment Rules State
  const [newPoolName, setNewPoolName] = useState('');
  const [newPoolPrice, setNewPoolPrice] = useState('25M');
  const [newPoolLegend, setNewPoolLegend] = useState(false);
  const [poolSetBatchPlayers, setPoolSetBatchPlayers] = useState('');
  const [quickAddPoolPlayer, setQuickAddPoolPlayer] = useState({});
  const [assignModalPool, setAssignModalPool] = useState(null);
  const [assignSelectedItemIds, setAssignSelectedItemIds] = useState([]);
  const [assignSyncPrice, setAssignSyncPrice] = useState(false);
  const [poolViewFilter, setPoolViewFilter] = useState({});

  const [incMinInput, setIncMinInput] = useState('0');
  const [incMaxInput, setIncMaxInput] = useState('');
  const [incStepInput, setIncStepInput] = useState('5M');

  // Audit Filter
  const [auditSearch, setAuditSearch] = useState('');

  // Refresh All Images, Refresh Stats & Restart Auction Confirmation State
  const [refreshingAllImages, setRefreshingAllImages] = useState(false);
  const [refreshingStats, setRefreshingStats] = useState(false);
  const [restartConfirmText, setRestartConfirmText] = useState('');

  useEffect(() => {
    if (auction) {
      setMaxRtmConfigInput(String(auction.maxRtmPerTeam ?? 0));
      setMaxRetConfigInput(String(auction.maxRetentionsPerTeam ?? 3));
    }
  }, [auction?.id, auction?.maxRtmPerTeam, auction?.maxRetentionsPerTeam]);

  const showNotice = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  if (loading && !auction) {
    return (
      <div className="min-h-screen bg-[#07090E] text-white flex items-center justify-center">
        <div className="text-sm font-bold text-amber-400 animate-pulse">
          Loading Auction Control Desk...
        </div>
      </div>
    );
  }

  if (error || !auction) {
    return (
      <div className="min-h-screen bg-[#07090E] text-white flex flex-col items-center justify-center gap-4 p-6">
        <div className="text-rose-400 font-bold">{error || 'Auction not found'}</div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
        >
          Return to Portal
        </button>
      </div>
    );
  }

  const cur = auction.currency;
  const activeItem = auction.activeItem;
  const leadingTeam = activeItem?.highestBidderTeam || null;
  const isIpl = isIplAuction(auction);
  const overlay =
    auction.projectorOverlay && auction.projectorOverlay.expiresAt > Date.now()
      ? auction.projectorOverlay
      : null;

  const isRetentionsLocked =
    auction.status === AUCTION_STATES.LIVE ||
    auction.status === AUCTION_STATES.PAUSED ||
    auction.status === AUCTION_STATES.COMPLETED;

  // ==========================================================================
  // ACTION HANDLERS
  // ==========================================================================

  const handleStateChange = async nextStatus => {
    try {
      setBusyAction(true);
      if (setAuction) {
        setAuction(prev => (prev ? { ...prev, status: nextStatus } : prev));
      }
      if (broadcastLiveEvent) {
        broadcastLiveEvent('auction:state_change', { status: nextStatus });
      }
      await apiFetch(`/api/auctions/${auctionId}/state`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus })
      });
      showNotice(`Auction state updated to ${nextStatus}`);
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleReopenAuction = async () => {
    try {
      setBusyAction(true);
      await apiFetch(`/api/auctions/${auctionId}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ targetStatus: AUCTION_STATES.LIVE })
      });
      showNotice('Auction reopened.');
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleToggleDay1Summary = async () => {
    try {
      setBusyAction(true);
      const isCurrentlyActive = auction?.projectorOverlay?.type === 'DAY_1_SUMMARY';
      const nextActive = !isCurrentlyActive;
      const overlayPayload = nextActive
        ? { type: 'DAY_1_SUMMARY', activatedAt: new Date().toISOString() }
        : null;

      // 1. Instant optimistic local UI update (0ms latency for admin)
      if (setAuction) {
        setAuction(prev => {
          if (!prev) return prev;
          const nextStatus =
            nextActive && prev.status === AUCTION_STATES.LIVE ? AUCTION_STATES.PAUSED : prev.status;
          return {
            ...prev,
            status: nextStatus,
            projectorOverlay: overlayPayload
          };
        });
      }

      // 2. Instant client-to-client broadcast (< 25ms latency to Projector & all peers)
      if (broadcastLiveEvent) {
        broadcastLiveEvent('DAY_1_SUMMARY_TOGGLED', {
          active: nextActive,
          overlay: overlayPayload
        });
      }

      // 3. Server-side database persistence
      await apiFetch(`/api/auctions/${auctionId}/day1-summary`, {
        method: 'POST',
        body: JSON.stringify({ active: nextActive })
      });
      showNotice(
        nextActive
          ? 'End of Day 1 Projector Showcase Activated!'
          : 'Day 1 Summary Closed. Projector Restored.'
      );
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleStartItem = async (itemId = null) => {
    try {
      setBusyAction(true);
      await apiFetch(`/api/auctions/${auctionId}/start-item`, {
        method: 'POST',
        body: JSON.stringify({ itemId })
      });
      showNotice('Item is now LIVE on the bidding block.');
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handlePlaceIncrementBid = async teamIdToBid => {
    const targetTeam = teamIdToBid || selectedBidTeamId;
    if (!targetTeam) {
      showNotice('Select a team to place a bid.', 'error');
      return;
    }
    try {
      setBusyAction(true);
      setSelectedBidTeamId(targetTeam);
      await apiFetch(`/api/auctions/${auctionId}/bid`, {
        method: 'POST',
        body: JSON.stringify({ teamId: targetTeam, mode: 'INCREMENT' })
      });
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleManualBidSubmit = async e => {
    e.preventDefault();
    try {
      setBusyAction(true);
      const amount = parseCurrencyInput(manualBidInput, cur);
      await apiFetch(`/api/auctions/${auctionId}/bid`, {
        method: 'POST',
        body: JSON.stringify({
          teamId: manualBidTeamId,
          mode: 'MANUAL',
          manualAmount: amount,
          allowOverride: manualBidOverride
        })
      });
      setShowEditBidModal(false);
      showNotice('Manual bid recorded.');
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleUndoBid = async () => {
    try {
      setBusyAction(true);
      await apiFetch(`/api/auctions/${auctionId}/undo-bid`, { method: 'POST' });
      showNotice('Last bid undone.');
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSold = async () => {
    try {
      setBusyAction(true);
      await apiFetch(`/api/auctions/${auctionId}/sold`, { method: 'POST' });
      showNotice('SOLD! Displaying 3-second celebration screen before advancing...');
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleRtmSaleSubmit = async e => {
    e.preventDefault();
    if (!rtmTeamId) {
      showNotice('Select the team exercising RTM.', 'error');
      return;
    }
    try {
      setBusyAction(true);
      const rtmAmount = rtmAmountInput
        ? parseCurrencyInput(rtmAmountInput, cur)
        : Number(activeItem?.currentBid || activeItem?.basePrice || 0);
      await apiFetch(`/api/auctions/${auctionId}/sold`, {
        method: 'POST',
        body: JSON.stringify({
          rtmTeamId,
          rtmAmount
        })
      });
      setShowRtmModal(false);
      showNotice('SOLD VIA RTM! RTM card used and purse deducted.');
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };
  const handleRtmSubmit = handleRtmSaleSubmit;

  const handleUnsold = async () => {
    try {
      setBusyAction(true);
      await apiFetch(`/api/auctions/${auctionId}/unsold`, { method: 'POST' });
      showNotice('Marked UNSOLD. Moving to next item in 3 seconds...');
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSkip = async () => {
    try {
      setBusyAction(true);
      await apiFetch(`/api/auctions/${auctionId}/skip`, { method: 'POST' });
      showNotice('Item skipped and returned to queue.');
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleWithdraw = async destination => {
    try {
      setBusyAction(true);
      await apiFetch(`/api/auctions/${auctionId}/withdraw`, {
        method: 'POST',
        body: JSON.stringify({ destination, autoStartNext: true })
      });
      setShowWithdrawModal(false);
      showNotice(
        destination === 'UNSOLD'
          ? 'Item withdrawn to Unsold Pool.'
          : 'Item withdrawn and returned to Queue.'
      );
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  // Queue Reorder
  const handleReorderQueue = async newQueueIds => {
    try {
      await apiFetch(`/api/auctions/${auctionId}/queue/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ orderedItemIds: newQueueIds })
      });
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  const moveQueueItem = (index, direction) => {
    const ids = (auction.queue || []).map(i => i.id);
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= ids.length) return;
    const temp = ids[index];
    ids[index] = ids[targetIdx];
    ids[targetIdx] = temp;
    handleReorderQueue(ids);
  };

  // Add Item (Manual Entry)
  const handleAddItem = async e => {
    e.preventDefault();
    try {
      setBusyAction(true);
      const poolToUse = newItemPool || auction.pools?.[0]?.name || 'General Pool';
      const matchingPool = auction.pools?.find(p => p.name === poolToUse);
      const parsedPrice = newItemPrice
        ? parseCurrencyInput(newItemPrice, cur)
        : matchingPool?.defaultBasePrice || 10_000_000;

      const res = await apiFetch(`/api/auctions/${auctionId}/items`, {
        method: 'POST',
        body: JSON.stringify({
          name: newItemName,
          basePrice: parsedPrice,
          poolName: poolToUse,
          poolId: matchingPool?.id,
          queuePosition: newItemQueuePos !== '' ? Number(newItemQueuePos) : undefined
        })
      });
      if (res?.auction) {
        if (setAuction) setAuction(res.auction);
        if (broadcastLiveEvent) {
          broadcastLiveEvent('auction:item_added', { auction: res.auction, itemId: res.itemId });
        }
      }
      setNewItemName('');
      setNewItemPrice('');
      setNewItemQueuePos('');
      showNotice('Item added and image resolved automatically.');
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  // Excel / CSV Import
  const handleFileImport = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setBusyAction(true);
      const { parsed, errors } = await parseSpreadsheetItems(file, cur);
      if (parsed.length === 0) {
        showNotice(errors.join('; ') || 'No valid rows found in spreadsheet.', 'error');
        return;
      }
      const res = await apiFetch(`/api/auctions/${auctionId}/items/bulk`, {
        method: 'POST',
        body: JSON.stringify({ items: parsed })
      });
      if (res?.auction) {
        if (setAuction) setAuction(res.auction);
        if (broadcastLiveEvent) {
          broadcastLiveEvent('auction:item_added', { auction: res.auction });
        }
      }
      const warnCount = (errors?.length || 0) + (res.warnings?.length || 0);
      showNotice(
        `Imported ${res.importedCount} items! ${
          warnCount ? `(${warnCount} rows skipped)` : ''
        }`
      );
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRefreshItemImage = async itemId => {
    try {
      showNotice('Searching online for player image...');
      await apiFetch(`/api/auctions/${auctionId}/items/${itemId}/refresh-image`, {
        method: 'POST'
      });
      showNotice('Image refreshed and saved.');
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  const handleRefreshAllPlayerImages = async () => {
    try {
      setRefreshingAllImages(true);
      showNotice('Refreshing all player images online... Please wait.');
      const res = await apiFetch(`/api/auctions/${auctionId}/items/refresh-all-images`, {
        method: 'POST'
      });
      showNotice(`Refreshed ${res.refreshedCount || 0} player images and saved permanently!`);
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setRefreshingAllImages(false);
    }
  };

  const handleRefreshAllStats = async () => {
    try {
      setRefreshingStats(true);
      showNotice('Refreshing IPL & Football player stats and Last Team Played...');
      const res = await apiFetch(`/api/auctions/${auctionId}/items/refresh-stats`, {
        method: 'POST'
      });
      showNotice(
        `Refreshed stats & Last Team Played for ${res.updatedStatsCount || 0} players and synced to Projector!`
      );
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setRefreshingStats(false);
    }
  };

  const handleAutoDeduplicate = async () => {
    if (!window.confirm('Scan and delete duplicate players from this auction? Any sold or retained players will be kept safe.')) {
      return;
    }
    try {
      showNotice('Scanning and removing duplicate players...');
      const res = await apiFetch(`/api/auctions/${auctionId}/items/deduplicate`, {
        method: 'POST'
      });
      if (res.removedCount > 0) {
        showNotice(`Removed ${res.removedCount} duplicate players (${res.removedNames.join(', ')})!`);
      } else {
        showNotice('No duplicate players found. All players in the auction roster are 100% unique!');
      }
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  const handleRestartAuction = async e => {
    if (e) e.preventDefault();
    if (restartConfirmText.trim().toLowerCase() !== 'i confirm') {
      showNotice('You must type "I confirm" to restart the auction.', 'error');
      return;
    }
    try {
      setBusyAction(true);
      await apiFetch(`/api/auctions/${auctionId}/reset`, {
        method: 'POST',
        body: JSON.stringify({ confirmationText: restartConfirmText })
      });
      setRestartConfirmText('');
      showNotice('Auction restarted! All bids & sales cleared and purses restored to READY state.');
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveItemEdit = async e => {
    e.preventDefault();
    if (!editingItem) return;
    try {
      const parsedPrice = parseCurrencyInput(editingItem.basePriceInput, cur);
      await apiFetch(`/api/auctions/${auctionId}/items/${editingItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editingItem.name,
          basePrice: parsedPrice,
          poolName: editingItem.poolName,
          imageUrl: editingItem.imageUrl
        })
      });
      setEditingItem(null);
      showNotice('Item updated.');
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  const handleDeleteItem = async itemId => {
    try {
      await apiFetch(`/api/auctions/${auctionId}/items/${itemId}`, { method: 'DELETE' });
      showNotice('Item deleted.');
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  // Re-auction Unsold Item
  const handleReauctionSubmit = async (startImmediately = false) => {
    if (!reauctionModalItem) return;
    try {
      const overridePrice = reauctionPriceInput
        ? parseCurrencyInput(reauctionPriceInput, cur)
        : undefined;
      await apiFetch(
        `/api/auctions/${auctionId}/items/${reauctionModalItem.id}/reauction`,
        {
          method: 'POST',
          body: JSON.stringify({
            overrideBasePrice: overridePrice,
            startImmediately,
            queuePosition: 'TOP'
          })
        }
      );
      setReauctionModalItem(null);
      showNotice(
        startImmediately
          ? 'Item started immediately for re-auction!'
          : 'Item returned to top of queue for re-auction.'
      );
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  const handlePermanentUnsold = async itemId => {
    try {
      await apiFetch(`/api/auctions/${auctionId}/items/${itemId}/permanent-unsold`, {
        method: 'POST'
      });
      showNotice('Item permanently marked unsold.');
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  // Purchase Corrections (Undo Sale & Transfer Purchase)
  const handleUndoSale = async (itemId, returnTo = 'QUEUE') => {
    try {
      await apiFetch(`/api/auctions/${auctionId}/items/${itemId}/undo-sale`, {
        method: 'POST',
        body: JSON.stringify({ returnTo })
      });
      showNotice('Sale reversed and full amount refunded to team.');
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  const handleTransferPurchase = async e => {
    e.preventDefault();
    if (!transferModalItem || !transferTargetTeamId) return;
    try {
      const newAmt = transferAmountInput
        ? parseCurrencyInput(transferAmountInput, cur)
        : undefined;
      await apiFetch(
        `/api/auctions/${auctionId}/items/${transferModalItem.id}/transfer-sale`,
        {
          method: 'POST',
          body: JSON.stringify({
            targetTeamId: transferTargetTeamId,
            newAmount: newAmt
          })
        }
      );
      setTransferModalItem(null);
      showNotice('Purchase transferred and team purses recalculated.');
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  // Retentions & RTM Limits (Manual + Drag-and-Drop + Set Price)
  const getDefaultRetentionPriceString = team => {
    const count = team?.retentionsCount || team?.retentions?.length || 0;
    if (cur === 'INR') {
      const slabs = ['18Cr', '14Cr', '11Cr', '18Cr', '14Cr', '4Cr'];
      return slabs[count] || '11Cr';
    }
    if (cur === 'EUR') {
      const slabs = ['65M', '50M', '40M'];
      return slabs[count] || '40M';
    }
    return '10000';
  };

  const getRetentionPricePresets = () => {
    if (cur === 'INR') {
      return [
        { label: '₹21 Cr', value: '21Cr' },
        { label: '₹18 Cr (Slab 1)', value: '18Cr' },
        { label: '₹14 Cr (Slab 2)', value: '14Cr' },
        { label: '₹11 Cr (Slab 3)', value: '11Cr' },
        { label: '₹4 Cr (Uncapped)', value: '4Cr' }
      ];
    }
    if (cur === 'EUR') {
      return [
        { label: '€80M', value: '80M' },
        { label: '€65M', value: '65M' },
        { label: '€50M', value: '50M' },
        { label: '€40M', value: '40M' },
        { label: '€25M', value: '25M' }
      ];
    }
    return [
      { label: '$15,000', value: '15000' },
      { label: '$10,000', value: '10000' },
      { label: '$5,000', value: '5000' }
    ];
  };

  const handleCreateRetention = async e => {
    e.preventDefault();
    try {
      setBusyAction(true);
      const amt = parseCurrencyInput(retAmountInput, cur);
      await apiFetch(`/api/auctions/${auctionId}/retentions`, {
        method: 'POST',
        body: JSON.stringify({
          teamId: retTeamId || auction.teams?.[0]?.id,
          playerName: retPlayerName,
          amount: amt
        })
      });
      setRetPlayerName('');
      setRetAmountInput('');
      showNotice('Retention added, deducted from purse, and removed from auction queue.');
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDropOnTeamCard = team => {
    setDragOverTeamId(null);
    if (!draggedRetPayload || isRetentionsLocked) return;

    if (draggedRetPayload.kind === 'POOL_PLAYER') {
      setRetentionPriceModal({
        mode: 'CREATE',
        teamId: team.id,
        teamName: team.name,
        playerName: draggedRetPayload.playerName,
        amountInput: getDefaultRetentionPriceString(team)
      });
    } else if (draggedRetPayload.kind === 'EXISTING_RETENTION') {
      setRetentionPriceModal({
        mode: 'MOVE',
        retentionId: draggedRetPayload.retentionId,
        teamId: team.id,
        teamName: team.name,
        playerName: draggedRetPayload.playerName,
        amountInput: formatCurrency(draggedRetPayload.amount, cur)
      });
    }
    setDraggedRetPayload(null);
  };

  const handleConfirmRetentionPriceModal = async e => {
    e.preventDefault();
    if (!retentionPriceModal) return;
    try {
      setBusyAction(true);
      const amt = parseCurrencyInput(retentionPriceModal.amountInput, cur);
      if (retentionPriceModal.mode === 'MOVE' && retentionPriceModal.retentionId) {
        await apiFetch(
          `/api/auctions/${auctionId}/retentions/${retentionPriceModal.retentionId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              teamId: retentionPriceModal.teamId,
              playerName: retentionPriceModal.playerName,
              amount: amt
            })
          }
        );
        showNotice(
          `${retentionPriceModal.playerName} retained by ${retentionPriceModal.teamName} for ${formatCurrency(amt, cur)}!`
        );
      } else {
        await apiFetch(`/api/auctions/${auctionId}/retentions`, {
          method: 'POST',
          body: JSON.stringify({
            teamId: retentionPriceModal.teamId,
            playerName: retentionPriceModal.playerName,
            amount: amt
          })
        });
        showNotice(
          `${retentionPriceModal.playerName} retained by ${retentionPriceModal.teamName} for ${formatCurrency(amt, cur)}!`
        );
      }
      setRetentionPriceModal(null);
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveRtmConfig = async e => {
    e.preventDefault();
    try {
      setBusyAction(true);
      const nextRtm =
        maxRtmConfigInput !== ''
          ? Math.max(0, Number(maxRtmConfigInput) || 0)
          : auction.maxRtmPerTeam ?? 0;
      const nextRet =
        maxRetConfigInput !== ''
          ? Math.max(0, Number(maxRetConfigInput) || 0)
          : auction.maxRetentionsPerTeam ?? 3;
      await apiFetch(`/api/auctions/${auctionId}/config`, {
        method: 'PATCH',
        body: JSON.stringify({
          maxRtmPerTeam: nextRtm,
          maxRetentionsPerTeam: nextRet,
          applyRtmToAllTeams: true
        })
      });
      showNotice(`Updated RTM cards (${nextRtm}/team) and Max Retentions (${nextRet}/team).`);
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleUpdateTeamRtm = async (team, newRtmTotal) => {
    const safeCount = Math.max(0, Math.min(15, Number(newRtmTotal) || 0));
    try {
      await apiFetch(`/api/auctions/${auctionId}/teams/${team.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          rtmCardsTotal: safeCount
        })
      });
      showNotice(`${team.shortName || team.name} RTM cards set to ${safeCount}.`);
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  const handleAutoCalculateTeamRtms = async () => {
    try {
      setBusyAction(true);
      const maxTotal = Math.max(1, Number(auction.maxRetentionsPerTeam) || 6);
      for (const team of auction.teams || []) {
        const retained = Number(team.retentionsCount) || 0;
        const calcRtm = Math.max(0, maxTotal - retained);
        await apiFetch(`/api/auctions/${auctionId}/teams/${team.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            rtmCardsTotal: calcRtm
          })
        });
      }
      showNotice(
        `Auto-calculated individual RTM cards for each team (${maxTotal} minus retained players)!`
      );
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteRetention = async retentionId => {
    try {
      await apiFetch(`/api/auctions/${auctionId}/retentions/${retentionId}`, {
        method: 'DELETE'
      });
      showNotice('Retention removed, full amount refunded, and player returned to auction pool.');
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  const handleSaveRetentionEdit = async e => {
    e.preventDefault();
    if (!editingRetention) return;
    try {
      const amt = parseCurrencyInput(editingRetention.amountInput, cur);
      await apiFetch(`/api/auctions/${auctionId}/retentions/${editingRetention.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          teamId: editingRetention.teamId,
          playerName: editingRetention.playerName,
          amount: amt
        })
      });
      setEditingRetention(null);
      showNotice('Retention price updated and team purse recalculated.');
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  const handlePublishRetentions = async publishState => {
    try {
      await apiFetch(`/api/auctions/${auctionId}/retentions/publish`, {
        method: 'POST',
        body: JSON.stringify({ published: publishState })
      });
      showNotice(
        publishState
          ? 'Retentions published to all teams and Projector.'
          : 'Retentions set back to private.'
      );
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  // Team Management
  const handleAddTeam = async e => {
    e.preventDefault();
    try {
      await apiFetch(`/api/auctions/${auctionId}/teams`, {
        method: 'POST',
        body: JSON.stringify({
          name: newTeamName,
          code: newTeamCode || undefined,
          pin: newTeamPin || undefined,
          logoUrl: newTeamLogo || undefined,
          primaryColor: newTeamPrimary,
          secondaryColor: newTeamSecondary,
          rtmCardsTotal:
            newTeamRtmCards !== '' ? Math.max(0, Number(newTeamRtmCards) || 0) : undefined
        })
      });
      setNewTeamName('');
      setNewTeamCode('');
      setNewTeamPin('');
      setNewTeamRtmCards('');
      setNewTeamLogo('');
      showNotice('Team added.');
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  const handleSaveTeamEdit = async e => {
    e.preventDefault();
    if (!editingTeam) return;
    try {
      const parsedPurse = parseCurrencyInput(editingTeam.startingPurseInput, cur);
      const rawRtm =
        editingTeam.rtmCardsTotalInput !== undefined
          ? editingTeam.rtmCardsTotalInput
          : editingTeam.rtmCardsTotal;
      await apiFetch(`/api/auctions/${auctionId}/teams/${editingTeam.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editingTeam.name,
          shortName: editingTeam.shortName,
          code: editingTeam.code,
          pin: editingTeam.pin,
          logoUrl: editingTeam.logoUrl,
          primaryColor: editingTeam.primaryColor,
          secondaryColor: editingTeam.secondaryColor,
          startingPurse: parsedPurse,
          rtmCardsTotal:
            rawRtm !== undefined && rawRtm !== '' ? Math.max(0, Number(rawRtm) || 0) : undefined,
          disabled: editingTeam.disabled
        })
      });
      setEditingTeam(null);
      showNotice('Team updated.');
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  const handleToggleTeamDisabled = async team => {
    try {
      await apiFetch(`/api/auctions/${auctionId}/teams/${team.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ disabled: !team.disabled })
      });
      showNotice(`${team.name} ${!team.disabled ? 'disabled' : 'enabled'}.`);
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  const handleDeleteTeam = async teamId => {
    try {
      await apiFetch(`/api/auctions/${auctionId}/teams/${teamId}`, { method: 'DELETE' });
      showNotice('Team removed.');
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  const handlePurseAdjustment = async e => {
    e.preventDefault();
    if (!purseModalTeam) return;
    try {
      const amt = parseCurrencyInput(purseAdjAmount, cur);
      await apiFetch(
        `/api/auctions/${auctionId}/teams/${purseModalTeam.id}/purse-adjustment`,
        {
          method: 'POST',
          body: JSON.stringify({
            type: purseAdjType,
            amount: amt,
            reason: purseAdjReason
          })
        }
      );
      setPurseModalTeam(null);
      setPurseAdjAmount('');
      setPurseAdjReason('');
      showNotice('Purse adjusted and logged in audit history.');
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  // Pool Sets & Increment Rules
  const handleAddPool = async e => {
    e.preventDefault();
    try {
      setBusyAction(true);
      const price = parseCurrencyInput(newPoolPrice, cur);
      const res = await apiFetch(`/api/auctions/${auctionId}/pools`, {
        method: 'POST',
        body: JSON.stringify({
          name: newPoolName,
          defaultBasePrice: price,
          isLegendPool: newPoolLegend,
          playerNames: poolSetBatchPlayers
        })
      });
      setNewPoolName('');
      setPoolSetBatchPlayers('');
      const addedMsg = res.addedPlayersCount
        ? ` with ${res.addedPlayersCount} players`
        : '';
      const skipMsg = res.skippedRetained?.length
        ? ` (skipped retained: ${res.skippedRetained.join(', ')})`
        : '';
      showNotice(`Pool Set created${addedMsg}${skipMsg}.`);
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleActivatePoolSet = async (poolId, shuffle = false) => {
    try {
      setBusyAction(true);
      const res = await apiFetch(`/api/auctions/${auctionId}/pools/${poolId}/activate-set`, {
        method: 'POST',
        body: JSON.stringify({ shuffle })
      });
      showNotice(
        shuffle
          ? `Shuffled and moved ${res.movedCount} players from Pool Set to the front of the queue!`
          : `Moved ${res.movedCount} players from Pool Set to the front of the queue!`
      );
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleAssignItemsToPoolSet = async e => {
    e.preventDefault();
    if (!assignModalPool) return;
    try {
      setBusyAction(true);
      await apiFetch(`/api/auctions/${auctionId}/pools/${assignModalPool.id}/assign-items`, {
        method: 'POST',
        body: JSON.stringify({
          itemIds: assignSelectedItemIds,
          syncBasePrice: assignSyncPrice
        })
      });
      setAssignModalPool(null);
      setAssignSelectedItemIds([]);
      showNotice(`Assigned ${assignSelectedItemIds.length} players to ${assignModalPool.name}.`);
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleQuickAddPlayerToPool = async pool => {
    const playerName = (quickAddPoolPlayer[pool.id] || '').trim();
    if (!playerName) return;
    try {
      setBusyAction(true);
      const res = await apiFetch(`/api/auctions/${auctionId}/items`, {
        method: 'POST',
        body: JSON.stringify({
          name: playerName,
          basePrice: pool.defaultBasePrice,
          poolName: pool.name,
          poolId: pool.id
        })
      });
      if (res?.auction) {
        if (setAuction) setAuction(res.auction);
        if (broadcastLiveEvent) {
          broadcastLiveEvent('auction:item_added', { auction: res.auction, itemId: res.itemId });
        }
      }
      setQuickAddPoolPlayer(prev => ({ ...prev, [pool.id]: '' }));
      showNotice(`Added ${playerName} to ${pool.name}.`);
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleClearPool = async pool => {
    const poolItems = (auction.items || []).filter(
      it =>
        it.poolId === pool.id ||
        String(it.poolName).toLowerCase() === String(pool.name).toLowerCase()
    );
    const queuedCount = poolItems.filter(
      it => it.status === 'QUEUED' || it.status === 'UNSOLD'
    ).length;

    if (queuedCount === 0) {
      showNotice(`No queued players in "${pool.name}" to clear.`);
      return;
    }

    if (
      !window.confirm(
        `Clear all ${queuedCount} available/queued players from "${pool.name}"? Any SOLD players will remain safe in team squads.`
      )
    ) {
      return;
    }

    try {
      setBusyAction(true);
      const res = await apiFetch(`/api/auctions/${auctionId}/pools/${pool.id}/clear`, {
        method: 'POST'
      });
      showNotice(
        res.message || `Cleared ${res.clearedCount || queuedCount} players from ${pool.name}!`
      );
      if (res?.auction && setAuction) {
        setAuction(res.auction);
      }
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeletePool = async poolId => {
    try {
      await apiFetch(`/api/auctions/${auctionId}/pools/${poolId}`, { method: 'DELETE' });
      showNotice('Pool Set deleted.');
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  const handleAddIncrementRule = async e => {
    e.preventDefault();
    const min = parseCurrencyInput(incMinInput, cur);
    const max = incMaxInput.trim() === '' ? null : parseCurrencyInput(incMaxInput, cur);
    const increment = parseCurrencyInput(incStepInput, cur);
    if (increment <= 0) {
      showNotice('Increment must be greater than zero.', 'error');
      return;
    }
    const nextRules = [...(auction.incrementRules || []), { min, max, increment }].sort(
      (a, b) => (a.min || 0) - (b.min || 0)
    );
    try {
      await apiFetch(`/api/auctions/${auctionId}/config`, {
        method: 'PATCH',
        body: JSON.stringify({ incrementRules: nextRules })
      });
      setIncMinInput('');
      setIncMaxInput('');
      showNotice('Bid increment rule added.');
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  const handleRemoveIncrementRule = async index => {
    const nextRules = (auction.incrementRules || []).filter((_, i) => i !== index);
    if (nextRules.length === 0) {
      showNotice('At least one increment rule is required.', 'error');
      return;
    }
    try {
      await apiFetch(`/api/auctions/${auctionId}/config`, {
        method: 'PATCH',
        body: JSON.stringify({ incrementRules: nextRules })
      });
      showNotice('Increment rule removed.');
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  const filteredItems = (auction.items || []).filter(item => {
    if (itemFilterPool !== 'ALL' && item.poolName !== itemFilterPool) return false;
    if (itemFilterStatus !== 'ALL' && item.status !== itemFilterStatus) return false;
    if (itemSearch && !item.name.toLowerCase().includes(itemSearch.toLowerCase())) return false;
    return true;
  });

  const filteredAuditLogs = (auction.auditLogs || []).filter(l => {
    if (!auditSearch) return true;
    const q = auditSearch.toLowerCase();
    return (
      l.action?.toLowerCase().includes(q) ||
      l.entityName?.toLowerCase().includes(q) ||
      l.userName?.toLowerCase().includes(q) ||
      l.userRole?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col">
      <VistaHeader
        auction={auction}
        connected={connected}
        rightActions={
          <div className="flex items-center gap-2 flex-wrap">
            {auction.status === AUCTION_STATES.DRAFT && (
              <button
                type="button"
                onClick={() => handleStateChange(AUCTION_STATES.READY)}
                className="px-3 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-extrabold cursor-pointer"
              >
                Set READY (Retention Board)
              </button>
            )}
            {(auction.status === AUCTION_STATES.READY ||
              auction.status === AUCTION_STATES.DRAFT) && (
              <button
                type="button"
                onClick={() =>
                  activeItem
                    ? handleStateChange(AUCTION_STATES.LIVE)
                    : handleStartItem()
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Go LIVE
              </button>
            )}
            {auction.status === AUCTION_STATES.LIVE && (
              <button
                type="button"
                onClick={() => handleStateChange(AUCTION_STATES.PAUSED)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
                PAUSE
              </button>
            )}
            {auction.status === AUCTION_STATES.PAUSED && (
              <button
                type="button"
                onClick={() => handleStateChange(AUCTION_STATES.LIVE)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                RESUME LIVE
              </button>
            )}
            {auction.status === AUCTION_STATES.COMPLETED && (
              <button
                type="button"
                onClick={handleReopenAuction}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                REOPEN AUCTION
              </button>
            )}

            {/* End of Day 1 Projector Showcase Toggle */}
            {isIpl && (
              <button
                type="button"
                onClick={handleToggleDay1Summary}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition-all shadow-md ${
                  auction.projectorOverlay?.type === 'DAY_1_SUMMARY'
                    ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 ring-2 ring-amber-300 animate-pulse'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                }`}
                title="Broadcast Day 1 Summary & Squads to Projector"
              >
                <Trophy className="w-3.5 h-3.5" />
                {auction.projectorOverlay?.type === 'DAY_1_SUMMARY'
                  ? 'EXIT DAY 1 SUMMARY'
                  : 'END OF DAY 1'}
              </button>
            )}
          </div>
        }
      />

      {/* Toast Notification */}
      {toast && (
        <div className="max-w-[1600px] w-full mx-auto px-4 lg:px-6 pt-3">
          <div
            className={`px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-between ${
              toast.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/60 text-rose-200'
                : 'bg-emerald-950/90 border-emerald-500/60 text-emerald-200'
            }`}
          >
            <span>{toast.msg}</span>
            <button type="button" onClick={() => setToast(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="bg-slate-950/80 border-b border-slate-800/80 px-4 lg:px-6">
        <div className="max-w-[1600px] mx-auto flex items-center gap-1.5 overflow-x-auto py-2">
          {[
            { id: 'CONTROL', label: 'Live Bidding Control', icon: Gavel },
            { id: 'POOL_SETS', label: `Pool Sets (${auction.pools?.length || 0})`, icon: FolderPlus },
            { id: 'ITEMS', label: `Queue & Items (${auction.items?.length || 0})`, icon: Layers },
            { id: 'CORRECTIONS', label: `Sales & Transfers (${auction.soldItems?.length || 0})`, icon: ArrowRightLeft },
            { id: 'RETENTIONS', label: `Retentions & RTM (${auction.retentions?.length || 0})`, icon: Lock },
            { id: 'TEAMS', label: `Teams & Purses (${auction.teams?.length || 0})`, icon: Users },
            { id: 'SETTINGS', label: 'Increment Rules & Settings', icon: Settings },
            { id: 'RESULTS_AUDIT', label: 'Results & Audit Log', icon: Award }
          ].map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider shrink-0 transition-all cursor-pointer ${
                  activeTab === t.id
                    ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 lg:px-6 py-5">
        {/* ===================================================================
            TAB 1: LIVE BIDDING CONTROL CENTRE
           =================================================================== */}
        {activeTab === 'CONTROL' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Left & Center Column (8 cols): Active Item Stage + Action Controls + Team Bid Grid */}
            <div className="xl:col-span-8 space-y-5">
              {/* 3-Second SOLD / UNSOLD Dramatic Transition Banner */}
              {overlay && (
                <div
                  className={`rounded-3xl p-6 border-2 animate-sold-pop flex flex-col sm:flex-row items-center justify-between gap-4 ${
                    overlay.type === 'SOLD'
                      ? 'bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 border-emerald-400'
                      : 'bg-gradient-to-r from-rose-950 via-slate-900 to-rose-950 border-rose-400'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {overlay.type === 'SOLD' && overlay.teamLogoUrl && (
                      <TeamLogo
                        name={overlay.teamName}
                        logoUrl={overlay.teamLogoUrl}
                        primaryColor={overlay.teamPrimaryColor}
                        size="lg"
                      />
                    )}
                    <div>
                      <div className="text-xs font-extrabold uppercase tracking-widest text-amber-400">
                        {overlay.type === 'SOLD'
                          ? overlay.soldViaRtm
                            ? '⚡ SOLD VIA RTM! (3-Second Projector Display Active)'
                            : '🏆 SOLD! (3-Second Projector Display Active)'
                          : 'UNSOLD (3-Second Projector Display Active)'}
                      </div>
                      <div className="font-display text-2xl sm:text-3xl font-extrabold text-white mt-0.5">
                        {overlay.itemName}
                        <OverseasPlane
                          playerName={overlay.itemName}
                          auction={auction}
                          className="ml-2 text-xl"
                        />
                      </div>
                      {overlay.type === 'SOLD' && (
                        <div className="text-sm text-emerald-300 font-bold mt-1">
                          {overlay.soldViaRtm ? 'Matched via RTM by ' : 'Awarded to '}
                          {overlay.teamName} for {formatCurrency(overlay.amount, cur)} • Remaining Purse:{' '}
                          {formatCurrency(overlay.remainingPurse, cur)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-xs font-mono-num text-slate-300 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-700">
                    Auto-advancing to next item...
                  </div>
                </div>
              )}

              {/* Active Item Control Deck */}
              {activeItem ? (
                <div
                  className="rounded-3xl bg-slate-900/95 border-2 p-6 shadow-2xl transition-all"
                  style={{
                    borderColor: activeItem.highestBidderTeam
                      ? `${activeItem.highestBidderTeam.primaryColor}99`
                      : '#1E293B'
                  }}
                >
                  {/* Top Row: Item Details + Key Financial Counters */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                    {/* Player / Item Image & Identity */}
                    <div className="md:col-span-5 flex items-start gap-4">
                      <ItemImage
                        item={activeItem}
                        accentColor={activeItem.highestBidderTeam?.primaryColor || '#F59E0B'}
                        className="w-28 h-32 sm:w-32 sm:h-36 rounded-2xl object-cover shrink-0 shadow-xl"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-extrabold uppercase tracking-wider">
                            {activeItem.poolName}
                          </div>
                          <button
                            type="button"
                            disabled={refreshingStats}
                            onClick={handleRefreshAllStats}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-indigo-500/20 hover:bg-indigo-500/35 border border-indigo-500/40 text-indigo-300 text-[10px] font-extrabold uppercase tracking-wider cursor-pointer"
                            title="Refresh IPL & Football Stats + Last Team Played and sync to Projector"
                          >
                            <RefreshCw className={`w-3 h-3 ${refreshingStats ? 'animate-spin' : ''}`} />
                            {refreshingStats ? 'Syncing Stats...' : 'Refresh Stats'}
                          </button>
                        </div>
                        <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white mt-1.5 leading-tight break-words">
                          {activeItem.name}
                          <OverseasPlane
                            playerName={activeItem.name}
                            auction={auction}
                            className="ml-2 text-xl"
                          />
                        </h2>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-slate-400">
                          <span>
                            BASE PRICE:{' '}
                            <strong className="font-mono-num text-white">
                              {formatCurrency(activeItem.basePrice, cur)}
                            </strong>
                          </span>
                          <span>•</span>
                          <span>
                            INCREMENT:{' '}
                            <strong className="font-mono-num text-amber-400">
                              +{formatCurrency(activeItem.currentIncrement, cur)}
                            </strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Dominant Bid & Highest Bidder Readout */}
                    <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Current Bid */}
                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                          CURRENT BID
                        </div>
                        <div className="font-mono-num text-2xl sm:text-3xl font-extrabold text-amber-400 mt-1">
                          {activeItem.currentBid > 0
                            ? formatCurrency(activeItem.currentBid, cur)
                            : 'NO BIDS'}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          Base: {formatCurrency(activeItem.basePrice, cur)}
                        </div>
                      </div>

                      {/* Highest Bidder */}
                      <div
                        className="p-4 rounded-2xl bg-slate-950 border flex flex-col justify-between"
                        style={{
                          borderColor: activeItem.highestBidderTeam
                            ? activeItem.highestBidderTeam.primaryColor
                            : '#1E293B'
                        }}
                      >
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                          HIGHEST BIDDER
                        </div>
                        {activeItem.highestBidderTeam ? (
                          <div className="flex items-center gap-2.5 mt-1.5">
                            <TeamLogo team={activeItem.highestBidderTeam} size="sm" />
                            <div className="min-w-0">
                              <div className="font-display font-extrabold text-base text-white truncate">
                                {activeItem.highestBidderTeam.name}
                              </div>
                              <div className="text-[11px] font-mono-num text-slate-400">
                                Purse: {formatCurrency(activeItem.highestBidderTeam.remainingPurse, cur)}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm font-bold text-slate-500 mt-2">
                            Awaiting Opening Bid
                          </div>
                        )}
                      </div>

                      {/* Next Bid */}
                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                          NEXT BID
                        </div>
                        <div className="font-mono-num text-2xl sm:text-3xl font-extrabold text-emerald-400 mt-1">
                          {formatCurrency(activeItem.nextBidAmount, cur)}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          {activeItem.highestBidderTeamId
                            ? `+${formatCurrency(activeItem.currentIncrement, cur)} step`
                            : 'Opening Base Price'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Primary Action Controls Bar */}
                  <div className="mt-6 pt-5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    {/* Left: Team Selector + Primary + BID + EDIT BID + UNDO BID */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={selectedBidTeamId}
                        onChange={e => setSelectedBidTeamId(e.target.value)}
                        className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2.5 text-xs font-bold text-white focus:border-amber-500"
                      >
                        <option value="">-- Select Bidding Team --</option>
                        {(auction.teams || [])
                          .filter(t => !t.disabled)
                          .map(t => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({formatCurrency(t.remainingPurse, cur)})
                            </option>
                          ))}
                      </select>

                      <button
                        type="button"
                        disabled={busyAction || auction.status !== AUCTION_STATES.LIVE}
                        onClick={() => handlePlaceIncrementBid(selectedBidTeamId)}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 cursor-pointer"
                      >
                        + BID ({formatCurrency(activeItem.nextBidAmount, cur)})
                      </button>

                      <button
                        type="button"
                        disabled={busyAction || auction.status !== AUCTION_STATES.LIVE}
                        onClick={() => {
                          setManualBidTeamId(
                            selectedBidTeamId ||
                              activeItem.highestBidderTeamId ||
                              auction.teams?.[0]?.id ||
                              ''
                          );
                          setManualBidInput(
                            formatCurrency(activeItem.nextBidAmount, cur)
                          );
                          setManualBidOverride(false);
                          setShowEditBidModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        EDIT BID
                      </button>

                      <button
                        type="button"
                        disabled={busyAction || !activeItem.bids?.length}
                        onClick={handleUndoBid}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-amber-300 font-bold text-xs cursor-pointer"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        UNDO BID
                      </button>
                    </div>

                    {/* Right: SOLD, RTM, UNSOLD, SKIP, WITHDRAW, PAUSE */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        disabled={
                          busyAction ||
                          !activeItem.highestBidderTeamId ||
                          auction.status !== AUCTION_STATES.LIVE
                        }
                        onClick={handleSold}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/25 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        SOLD
                      </button>

                      <button
                        type="button"
                        disabled={busyAction || auction.status !== AUCTION_STATES.LIVE}
                        onClick={() => {
                          const activeTeams = (auction.teams || []).filter(t => !t.disabled);
                          const eligibleTeams = activeTeams.filter(t => (t.rtmRemaining || 0) > 0);
                          const defaultTeam =
                            eligibleTeams.find(t => t.id !== activeItem.highestBidderTeamId) ||
                            eligibleTeams[0] ||
                            activeTeams.find(t => t.id !== activeItem.highestBidderTeamId) ||
                            activeTeams[0];
                          setRtmTeamId(defaultTeam?.id || '');
                          setRtmAmountInput(
                            formatCurrency(
                              activeItem.currentBid > 0
                                ? activeItem.currentBid
                                : activeItem.basePrice,
                              cur
                            )
                          );
                          setShowRtmModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-purple-600/20 cursor-pointer"
                        title="Use Right To Match (RTM) card to award player"
                      >
                        <Zap className="w-4 h-4" />
                        RTM
                      </button>

                      <button
                        type="button"
                        disabled={busyAction || auction.status !== AUCTION_STATES.LIVE}
                        onClick={handleUnsold}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 disabled:opacity-40 text-white font-extrabold text-xs uppercase tracking-wider cursor-pointer"
                      >
                        <XCircle className="w-4 h-4" />
                        UNSOLD
                      </button>

                      <button
                        type="button"
                        disabled={busyAction || auction.status !== AUCTION_STATES.LIVE}
                        onClick={handleSkip}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-300 border border-indigo-500/40 font-bold text-xs uppercase cursor-pointer"
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                        SKIP
                      </button>

                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => setShowWithdrawModal(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase cursor-pointer"
                      >
                        WITHDRAW
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleStateChange(
                            auction.status === AUCTION_STATES.PAUSED
                              ? AUCTION_STATES.LIVE
                              : AUCTION_STATES.PAUSED
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs uppercase cursor-pointer"
                      >
                        {auction.status === AUCTION_STATES.PAUSED ? 'RESUME' : 'PAUSE'}
                      </button>

                      {isIpl && (
                        <button
                          type="button"
                          onClick={handleToggleDay1Summary}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase cursor-pointer transition-all ${
                            auction.projectorOverlay?.type === 'DAY_1_SUMMARY'
                              ? 'bg-amber-400 text-slate-950 font-extrabold ring-2 ring-amber-300'
                              : 'bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/50'
                          }`}
                          title="Toggle Day 1 Summary Showcase on Projector"
                        >
                          <Trophy className="w-3.5 h-3.5" />
                          {auction.projectorOverlay?.type === 'DAY_1_SUMMARY' ? 'EXIT DAY 1' : 'DAY 1 END'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-8 text-center space-y-4">
                  <Gavel className="w-12 h-12 text-amber-400 mx-auto" />
                  <div>
                    <h3 className="font-display text-2xl font-extrabold text-white">
                      {auction.status === AUCTION_STATES.COMPLETED
                        ? 'Auction Completed — All Queued Items Processed'
                        : auction.status === AUCTION_STATES.READY
                        ? 'Auction is READY — Retention Board Displayed on Projector'
                        : 'No Active Item on the Bidding Block'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {auction.queue?.length > 0
                        ? `${auction.queue.length} items waiting in queue. Next up: ${auction.queue[0].name} (${formatCurrency(auction.queue[0].basePrice, cur)})`
                        : 'No items left in the queue. You can add items or re-auction unsold items.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    {auction.queue?.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleStartItem()}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm uppercase tracking-wider shadow-xl shadow-amber-500/20 cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        Start Next Item ({auction.queue[0].name})
                      </button>
                    )}
                    {isIpl && (
                      <button
                        type="button"
                        onClick={handleToggleDay1Summary}
                        className={`inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-extrabold text-sm uppercase tracking-wider transition-all cursor-pointer shadow-xl ${
                          auction.projectorOverlay?.type === 'DAY_1_SUMMARY'
                            ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 ring-2 ring-amber-300 animate-pulse'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                        }`}
                      >
                        <Trophy className="w-4 h-4" />
                        {auction.projectorOverlay?.type === 'DAY_1_SUMMARY'
                          ? 'Exit Day 1 Summary'
                          : 'End of Day 1 (Projector Summary)'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Fast 1-Click Team Bidding Grid */}
              <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-sm font-extrabold uppercase tracking-wider text-slate-300">
                    Team Bidding Console — Click Any Team to Place{' '}
                    <span className="text-amber-400 font-mono-num">
                      {activeItem ? formatCurrency(activeItem.nextBidAmount, cur) : 'Next Bid'}
                    </span>
                  </h3>
                  <span className="text-xs text-slate-400">
                    Purse & increment rules enforced
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {(auction.teams || []).map(team => {
                    const isLeading = activeItem?.highestBidderTeamId === team.id;
                    const nextBidAmt = activeItem?.nextBidAmount || 0;
                    const canAfford = team.remainingPurse >= nextBidAmt;
                    const canBid =
                      Boolean(activeItem) &&
                      auction.status === AUCTION_STATES.LIVE &&
                      !team.disabled &&
                      !isLeading &&
                      canAfford;
                    const overseasCount = isIpl ? getTeamOverseasCount(team, auction) : 0;

                    return (
                      <div
                        key={team.id}
                        onClick={() => setSelectedBidTeamId(team.id)}
                        className={`rounded-2xl p-3.5 border transition-all flex flex-col justify-between gap-3 cursor-pointer ${
                          isLeading
                            ? 'bg-slate-950 ring-2 ring-amber-400'
                            : selectedBidTeamId === team.id
                            ? 'bg-slate-950/90 border-amber-500/70'
                            : 'bg-slate-950/75 border-slate-800/90 hover:border-slate-700'
                        } ${team.disabled ? 'opacity-40' : ''}`}
                        style={{
                          borderTopWidth: '4px',
                          borderTopColor: team.primaryColor
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          <TeamLogo team={team} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="font-display font-bold text-xs text-white truncate">
                              {team.name}
                            </div>
                            <div className="font-mono-num text-sm font-extrabold text-amber-400">
                              {formatCurrency(team.remainingPurse, cur)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-400 flex-wrap gap-1">
                          <span>Squad: {team.squadCount}</span>
                          {team.rtmTotal > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">
                              RTM {team.rtmRemaining}/{team.rtmTotal}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={!canBid || busyAction}
                          onClick={e => {
                            e.stopPropagation();
                            handlePlaceIncrementBid(team.id);
                          }}
                          className={`w-full py-2 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                            isLeading
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default'
                              : !canAfford && activeItem
                              ? 'bg-rose-950/50 text-rose-400 border border-rose-800/40 cursor-not-allowed'
                              : canBid
                              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          {isLeading
                            ? 'HIGHEST BIDDER'
                            : !canAfford && activeItem
                            ? 'INSUFFICIENT PURSE'
                            : `+ BID ${activeItem ? formatCurrency(nextBidAmt, cur) : ''}`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column (4 cols): Bid History + Live Queue */}
            <div className="xl:col-span-4 space-y-5">
              {/* Bid History on Current Item */}
              <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display text-sm font-extrabold uppercase tracking-wider text-white">
                    BID HISTORY ({activeItem?.bids?.length || 0})
                  </h3>
                  {activeItem?.bids?.length > 0 && (
                    <button
                      type="button"
                      onClick={handleUndoBid}
                      className="text-xs font-bold text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Undo2 className="w-3.5 h-3.5" /> Undo Last
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {(activeItem?.bids || []).map((b, idx) => (
                    <div
                      key={b.id}
                      className={`p-3 rounded-xl border flex items-center justify-between ${
                        idx === 0
                          ? 'bg-amber-500/10 border-amber-500/40'
                          : 'bg-slate-950/80 border-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <TeamLogo
                          name={b.teamName}
                          shortName={b.teamShortName}
                          logoUrl={b.teamLogoUrl}
                          primaryColor={b.teamPrimaryColor}
                          size="xs"
                        />
                        <div>
                          <div className="text-xs font-bold text-white">
                            <span className="font-mono-num text-amber-400 font-extrabold">
                              {formatCurrency(b.amount, cur)}
                            </span>{' '}
                            — {b.teamName}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            By {b.placedByName} ({b.placedByRole})
                            {b.isOverride ? ' • OVERRIDE' : ''}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono-num text-slate-500">
                        {new Date(b.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                  {(!activeItem?.bids || activeItem.bids.length === 0) && (
                    <div className="py-8 text-center text-xs text-slate-500">
                      No bids placed on the current item yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Upcoming Auction Queue */}
              <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-display text-sm font-extrabold uppercase tracking-wider text-white">
                      UPCOMING QUEUE ({auction.queue?.length || 0})
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Drag or use arrows to reorder immediately
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('POOL_SETS')}
                      className="text-xs font-bold text-indigo-400 hover:underline cursor-pointer"
                    >
                      Pool Sets
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('ITEMS')}
                      className="text-xs font-bold text-amber-400 hover:underline cursor-pointer"
                    >
                      + Add Item
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {(auction.queue || []).slice(0, 25).map((qItem, idx) => (
                    <div
                      key={qItem.id}
                      draggable
                      onDragStart={() => setDraggedQueueIndex(idx)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => {
                        if (draggedQueueIndex === null || draggedQueueIndex === idx) return;
                        const ids = (auction.queue || []).map(i => i.id);
                        const [moved] = ids.splice(draggedQueueIndex, 1);
                        ids.splice(idx, 0, moved);
                        setDraggedQueueIndex(null);
                        handleReorderQueue(ids);
                      }}
                      className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-2 cursor-grab"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <GripVertical className="w-4 h-4 text-slate-600 shrink-0" />
                        <span className="w-5 text-[11px] font-mono-num text-slate-500 font-bold">
                          #{idx + 1}
                        </span>
                        <ItemImage
                          item={qItem}
                          className="w-9 h-9 rounded-lg object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">
                            {qItem.name}
                            <OverseasPlane playerName={qItem.name} auction={auction} />
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {qItem.poolName} •{' '}
                            <span className="font-mono-num text-amber-400">
                              {formatCurrency(qItem.basePrice, cur)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveQueueItem(idx, -1)}
                          disabled={idx === 0}
                          className="p-1 text-slate-400 hover:text-white disabled:opacity-25 cursor-pointer"
                          title="Move Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveQueueItem(idx, 1)}
                          disabled={idx === (auction.queue?.length || 1) - 1}
                          className="p-1 text-slate-400 hover:text-white disabled:opacity-25 cursor-pointer"
                          title="Move Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartItem(qItem.id)}
                          className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-extrabold cursor-pointer"
                        >
                          Start
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 2: POOL SETS BUILDER & QUEUE ACTIVATION
           =================================================================== */}
        {activeTab === 'POOL_SETS' && (
          <div className="space-y-6">
            {/* Create Pool Set Builder Card */}
            <form
              onSubmit={handleAddPool}
              className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
                    <FolderPlus className="w-5 h-5 text-amber-400" />
                    Make a Pool Set
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Create a Pool Set (e.g. Set 1: Marquee, Set 2: Capped Batters, Set 3: Fast Bowlers) with a default base price and optionally add players directly into the set.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-5 space-y-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                      Pool Set Name
                    </label>
                    <input
                      type="text"
                      value={newPoolName}
                      onChange={e => setNewPoolName(e.target.value)}
                      placeholder="e.g. Set 1 — Marquee / Set 2 — All-Rounders"
                      required
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 items-end">
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                        Set Default Base Price
                      </label>
                      <input
                        type="text"
                        value={newPoolPrice}
                        onChange={e => setNewPoolPrice(e.target.value)}
                        placeholder="e.g. 2Cr or 25M"
                        required
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm font-mono-num text-white"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-300 py-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newPoolLegend}
                        onChange={e => setNewPoolLegend(e.target.checked)}
                        className="accent-amber-500"
                      />
                      Legend / Marquee Tier
                    </label>
                  </div>
                </div>

                <div className="md:col-span-7 flex flex-col justify-between gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                      Add Players to This Pool Set (Optional — comma or newline separated)
                    </label>
                    <textarea
                      rows={3}
                      value={poolSetBatchPlayers}
                      onChange={e => setPoolSetBatchPlayers(e.target.value)}
                      placeholder="e.g.&#10;KL Rahul, Rishabh Pant, Shreyas Iyer, Mitchell Starc"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={busyAction}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Create Pool Set
                    </button>
                  </div>
                </div>
              </div>
            </form>

            {/* Pool Sets Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {(auction.pools || []).map(pool => {
                const poolItems = (auction.items || []).filter(
                  it =>
                    it.poolId === pool.id ||
                    String(it.poolName).toLowerCase() === String(pool.name).toLowerCase()
                );
                const queuedInPool = poolItems.filter(it => it.status === 'QUEUED');
                const soldInPool = poolItems.filter(it => it.status === 'SOLD');
                const unsoldInPool = poolItems.filter(
                  it => it.status === 'UNSOLD' || it.status === 'PERMANENTLY_UNSOLD'
                );

                const currentPoolFilter = poolViewFilter[pool.id] || 'QUEUED';
                const displayedPoolItems =
                  currentPoolFilter === 'ALL'
                    ? poolItems
                    : currentPoolFilter === 'SOLD'
                    ? soldInPool
                    : currentPoolFilter === 'UNSOLD'
                    ? unsoldInPool
                    : queuedInPool; // default is QUEUED only!

                return (
                  <div
                    key={pool.id}
                    className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 flex flex-col justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-display text-lg font-extrabold text-white">
                              {pool.name}
                            </h4>
                            {pool.isLegendPool ? (
                              <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-extrabold uppercase">
                                MARQUEE / LEGEND
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            Default Base Price:{' '}
                            <strong className="font-mono-num text-amber-400">
                              {formatCurrency(pool.defaultBasePrice, cur)}
                            </strong>{' '}
                            • Total: <strong>{poolItems.length}</strong> ({queuedInPool.length}{' '}
                            Available, {soldInPool.length} Sold, {unsoldInPool.length} Unsold)
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            disabled={busyAction || queuedInPool.length === 0}
                            onClick={() => handleActivatePoolSet(pool.id, false)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/35 disabled:opacity-35 text-emerald-300 border border-emerald-500/40 text-[11px] font-extrabold cursor-pointer"
                            title="Move all queued players in this set to the front of the live auction queue"
                          >
                            <Play className="w-3 h-3" />
                            Queue Set Next
                          </button>
                          <button
                            type="button"
                            disabled={busyAction || queuedInPool.length === 0}
                            onClick={() => handleActivatePoolSet(pool.id, true)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/35 disabled:opacity-35 text-indigo-300 border border-indigo-500/40 text-[11px] font-extrabold cursor-pointer"
                            title="Shuffle and move all queued players in this set to the front of the live auction queue"
                          >
                            <Shuffle className="w-3 h-3" />
                            Shuffle & Queue
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAssignModalPool(pool);
                              setAssignSelectedItemIds([]);
                              setAssignSyncPrice(false);
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold cursor-pointer"
                          >
                            + Assign Existing
                          </button>
                          <button
                            type="button"
                            disabled={busyAction || (queuedInPool.length === 0 && unsoldInPool.length === 0)}
                            onClick={() => handleClearPool(pool)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 disabled:opacity-35 text-rose-300 border border-rose-500/40 text-[11px] font-extrabold cursor-pointer"
                            title="Clear all available queued players from this pool"
                          >
                            <Trash2 className="w-3 h-3 text-rose-400" />
                            Clear Pool
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePool(pool.id)}
                            className="p-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 cursor-pointer"
                            title="Delete Pool Set"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Pool Filter Pills: Available vs Sold vs Unsold */}
                      <div className="flex items-center gap-1.5 mt-3 text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => setPoolViewFilter(prev => ({ ...prev, [pool.id]: 'QUEUED' }))}
                          className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                            currentPoolFilter === 'QUEUED'
                              ? 'bg-amber-500 text-slate-950 font-extrabold shadow'
                              : 'bg-slate-950/80 text-slate-400 hover:text-white border border-slate-800'
                          }`}
                        >
                          Available ({queuedInPool.length})
                        </button>
                        {soldInPool.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setPoolViewFilter(prev => ({ ...prev, [pool.id]: 'SOLD' }))}
                            className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                              currentPoolFilter === 'SOLD'
                                ? 'bg-emerald-500 text-slate-950 font-extrabold shadow'
                                : 'bg-slate-950/80 text-slate-400 hover:text-white border border-slate-800'
                            }`}
                          >
                            Sold ({soldInPool.length})
                          </button>
                        )}
                        {unsoldInPool.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setPoolViewFilter(prev => ({ ...prev, [pool.id]: 'UNSOLD' }))}
                            className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                              currentPoolFilter === 'UNSOLD'
                                ? 'bg-rose-500 text-slate-950 font-extrabold shadow'
                                : 'bg-slate-950/80 text-slate-400 hover:text-white border border-slate-800'
                            }`}
                          >
                            Unsold ({unsoldInPool.length})
                          </button>
                        )}
                      </div>

                      {/* Quick Add Player into this Pool Set */}
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          type="text"
                          value={quickAddPoolPlayer[pool.id] || ''}
                          onChange={e =>
                            setQuickAddPoolPlayer(prev => ({
                              ...prev,
                              [pool.id]: e.target.value
                            }))
                          }
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleQuickAddPlayerToPool(pool);
                            }
                          }}
                          placeholder={`Quick add player to ${pool.name}...`}
                          className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs text-white"
                        />
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => handleQuickAddPlayerToPool(pool)}
                          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs cursor-pointer"
                        >
                          + Add Player
                        </button>
                      </div>

                      {/* Players in this Pool Set */}
                      <div className="mt-3 space-y-1.5 max-h-56 overflow-y-auto pr-1">
                        {displayedPoolItems.map(item => (
                          <div
                            key={item.id}
                            className="px-3 py-2 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <ItemImage
                                item={item}
                                className="w-8 h-8 rounded-lg object-cover shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="font-bold text-white truncate">
                                  {item.name}
                                  <OverseasPlane playerName={item.name} auction={auction} />
                                </div>
                                <div className="text-[10px] font-mono-num text-amber-400">
                                  {item.status === 'SOLD' && item.soldAmount
                                    ? `Sold: ${formatCurrency(item.soldAmount, cur)}`
                                    : formatCurrency(item.basePrice, cur)}
                                </div>
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded shrink-0 ${
                                item.status === 'SOLD'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : item.status === 'QUEUED'
                                  ? 'bg-indigo-500/20 text-indigo-300'
                                  : 'bg-rose-500/20 text-rose-300'
                              }`}
                            >
                              {item.status}
                            </span>
                          </div>
                        ))}
                        {displayedPoolItems.length === 0 && (
                          <div className="py-5 text-center text-xs text-slate-500">
                            {currentPoolFilter === 'QUEUED'
                              ? soldInPool.length > 0
                                ? `All players in this pool have been auctioned (${soldInPool.length} Sold).`
                                : 'No available queued players in this pool.'
                              : currentPoolFilter === 'SOLD'
                              ? 'No players sold yet from this pool.'
                              : 'No unsold players in this pool.'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 2: QUEUE, ITEMS / PLAYERS & UNSOLD POOL (Sections 11, 12, 14, 15, 20)
           =================================================================== */}
        {activeTab === 'ITEMS' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Manual Item Entry (Standard Fields ONLY: Name, Base Price, Pool/Category + Queue Position) */}
              <form
                onSubmit={handleAddItem}
                className="lg:col-span-7 rounded-3xl bg-slate-900/90 border border-slate-800 p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-lg font-bold text-white">
                      Add Player / Item (Manual Entry)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Standard fields only. Image is automatically searched & saved online upon creation.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                      Player / Item Name
                    </label>
                    <input
                      type="text"
                      value={newItemName}
                      onChange={e => setNewItemName(e.target.value)}
                      placeholder="e.g. Antoine Griezmann"
                      required
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                      Pool / Category
                    </label>
                    <select
                      value={newItemPool}
                      onChange={e => {
                        setNewItemPool(e.target.value);
                        const p = auction.pools?.find(pl => pl.name === e.target.value);
                        if (p) setNewItemPrice(formatCurrency(p.defaultBasePrice, cur));
                      }}
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                    >
                      {(auction.pools || []).map(p => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                      Base Price
                    </label>
                    <input
                      type="text"
                      value={newItemPrice}
                      onChange={e => setNewItemPrice(e.target.value)}
                      placeholder="e.g. 25M"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm font-mono-num text-white"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400">
                      Queue Position (optional, 0 = Next Up):
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={newItemQueuePos}
                      onChange={e => setNewItemQueuePos(e.target.value)}
                      placeholder="End"
                      className="w-24 rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs font-mono-num text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busyAction}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add Item & Auto-Find Image
                  </button>
                </div>
              </form>

              {/* Excel / CSV Bulk Import (Section 11) */}
              <div className="lg:col-span-5 rounded-3xl bg-slate-900/90 border border-slate-800 p-6 flex flex-col justify-between gap-4">
                <div>
                  <h3 className="font-display text-lg font-bold text-white">
                    Excel / CSV Spreadsheet Import
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Upload `.xlsx`, `.xls`, or `.csv` with columns: <strong>Name</strong>,{' '}
                    <strong>Base Price</strong>, and <strong>Pool/Category</strong>. All rows are validated before adding.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileImport}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-extrabold text-xs uppercase tracking-wider cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Excel / CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadImportTemplate(cur)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    Download Template
                  </button>
                </div>
              </div>
            </div>

            {/* UNSOLD POOL SECTION */}
            {auction.unsoldItems?.length > 0 && (
              <div className="rounded-3xl bg-rose-950/20 border border-rose-500/30 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-lg font-bold text-white">
                      Unsold Pool ({auction.unsoldItems.length})
                    </h3>
                    <p className="text-xs text-slate-400">
                      Re-auction items (defaults to original base price, or override price) or permanently mark unsold.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {auction.unsoldItems.map(uItem => (
                    <div
                      key={uItem.id}
                      className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <ItemImage
                          item={uItem}
                          className="w-12 h-12 rounded-xl object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">
                            {uItem.name}
                            <OverseasPlane playerName={uItem.name} auction={auction} />
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {uItem.poolName} • Base:{' '}
                            <span className="font-mono-num text-amber-400">
                              {formatCurrency(uItem.originalBasePrice || uItem.basePrice, cur)}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold uppercase text-rose-400">
                            {uItem.status}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setReauctionModalItem(uItem);
                            setReauctionPriceInput(
                              formatCurrency(uItem.originalBasePrice || uItem.basePrice, cur)
                            );
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[11px] cursor-pointer"
                        >
                          Re-Auction
                        </button>
                        {uItem.status !== 'PERMANENTLY_UNSOLD' && (
                          <button
                            type="button"
                            onClick={() => handlePermanentUnsold(uItem.id)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] cursor-pointer"
                          >
                            Perm. Unsold
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Complete Items Directory with REFRESH ALL PLAYER IMAGES, REFRESH IMAGE & Edit */}
            <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="font-display text-lg font-bold text-white">
                    All Auction Items / Players ({filteredItems.length})
                  </h3>
                  <button
                    type="button"
                    disabled={refreshingAllImages || (auction.items?.length || 0) === 0}
                    onClick={handleRefreshAllPlayerImages}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshingAllImages ? 'animate-spin' : ''}`} />
                    {refreshingAllImages
                      ? 'Refreshing All Player Images...'
                      : 'Refresh All Player Images'}
                  </button>
                  <button
                    type="button"
                    disabled={refreshingStats || (auction.items?.length || 0) === 0}
                    onClick={handleRefreshAllStats}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-indigo-500/20 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshingStats ? 'animate-spin' : ''}`} />
                    {refreshingStats
                      ? 'Refreshing Stats & Last Team...'
                      : 'Refresh All Stats & Last Team'}
                  </button>
                  <button
                    type="button"
                    onClick={handleAutoDeduplicate}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-extrabold text-xs uppercase tracking-wider shadow cursor-pointer"
                    title="Automatically scan and delete duplicate players from this auction"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    Auto-Delete Duplicates
                  </button>
                  <Link
                    to={`/players/${auction.id}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-extrabold text-xs uppercase tracking-wider shadow cursor-pointer"
                    title="View & search all players in full-screen showcase"
                  >
                    <Users className="w-3.5 h-3.5 text-emerald-400" />
                    Players Pool Showcase
                  </Link>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={itemSearch}
                      onChange={e => setItemSearch(e.target.value)}
                      placeholder="Search player/item..."
                      className="rounded-xl bg-slate-950 border border-slate-800 pl-8 pr-3 py-1.5 text-xs text-white"
                    />
                  </div>
                  <select
                    value={itemFilterPool}
                    onChange={e => setItemFilterPool(e.target.value)}
                    className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs text-white"
                  >
                    <option value="ALL">All Pools</option>
                    {(auction.pools || []).map(p => (
                      <option key={p.id} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={itemFilterStatus}
                    onChange={e => setItemFilterStatus(e.target.value)}
                    className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs text-white"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="QUEUED">QUEUED</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="SOLD">SOLD</option>
                    <option value="UNSOLD">UNSOLD</option>
                    <option value="PERMANENTLY_UNSOLD">PERMANENTLY_UNSOLD</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredItems.map(item => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ItemImage
                        item={item}
                        className="w-14 h-14 rounded-xl object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">
                          {item.name}
                          <OverseasPlane playerName={item.name} auction={auction} />
                        </div>
                        <div className="text-xs text-slate-400 truncate">{item.poolName}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-mono-num font-bold text-amber-400">
                            Base: {formatCurrency(item.basePrice, cur)}
                          </span>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                              item.status === 'SOLD'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : item.status === 'ACTIVE'
                                ? 'bg-amber-500/20 text-amber-300'
                                : item.status === 'QUEUED'
                                ? 'bg-indigo-500/20 text-indigo-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRefreshItemImage(item.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-amber-300 cursor-pointer"
                        title="Automatically search & replace image online"
                      >
                        <RefreshCw className="w-3 h-3" />
                        REFRESH IMAGE
                      </button>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            setEditingItem({
                              ...item,
                              basePriceInput: formatCurrency(item.basePrice, cur)
                            })
                          }
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                          title="Edit Item / Manual Image Replace"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {item.status !== 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 cursor-pointer"
                            title="Delete Item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 3: PURCHASE CORRECTIONS (Undo Sale & Transfer Purchase)
           =================================================================== */}
        {activeTab === 'CORRECTIONS' && (
          <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 space-y-4">
            <div>
              <h3 className="font-display text-lg font-bold text-white">
                Purchase Corrections — Undo Entire Sale or Transfer Purchase
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Every reversal or transfer automatically recalculates team purses, RTM cards, and squads transactionally and logs the operation in the audit log.
              </p>
            </div>

            {auction.soldItems?.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">
                No items have been sold in this auction yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {auction.soldItems.map(sold => (
                  <div
                    key={sold.id}
                    className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3.5">
                      <ItemImage
                        item={sold}
                        className="w-14 h-14 rounded-xl object-cover shrink-0"
                      />
                      <div>
                        <div className="font-display font-bold text-base text-white">
                          {sold.name}
                          <OverseasPlane playerName={sold.name} auction={auction} />
                          {sold.soldViaRtm && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-extrabold">
                              RTM
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">{sold.poolName}</div>
                        <div className="flex items-center gap-2 mt-1">
                          {sold.soldToTeam && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white">
                              <TeamLogo team={sold.soldToTeam} size="xs" />
                              {sold.soldToTeam.name}
                            </span>
                          )}
                          <span className="font-mono-num text-sm font-extrabold text-emerald-400">
                            {formatCurrency(sold.soldAmount, cur)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setTransferModalItem(sold);
                          setTransferTargetTeamId(
                            auction.teams?.find(t => t.id !== sold.soldToTeamId)?.id || ''
                          );
                          setTransferAmountInput(formatCurrency(sold.soldAmount, cur));
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-300 border border-indigo-500/40 text-xs font-bold cursor-pointer"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        Transfer Purchase
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUndoSale(sold.id, 'QUEUE')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 border border-rose-500/40 text-xs font-bold cursor-pointer"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        Undo Sale (Refund)
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            TAB 4: RETENTION & RTM SYSTEM
           =================================================================== */}
        {activeTab === 'RETENTIONS' && (
          <div className="space-y-6">
            {/* Retention & RTM Publishing + Admin Limits Bar */}
            <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase ${
                      isRetentionsLocked
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : auction.retentionsPublished
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {isRetentionsLocked
                      ? 'LOCKED (Auction is LIVE/Completed)'
                      : auction.retentionsPublished
                      ? 'PUBLISHED TO TEAMS & PROJECTOR'
                      : 'PRIVATE SETUP'}
                  </span>
                  <span className="text-xs text-slate-400">
                    Max Retentions / Team: <strong>{auction.maxRetentionsPerTeam}</strong>
                  </span>
                  <span className="text-xs text-purple-300 font-bold">
                    RTM Cards / Team: <strong>{auction.maxRtmPerTeam || 0}</strong>
                  </span>
                </div>
                <h3 className="font-display text-xl font-bold text-white mt-2">
                  Retentions & RTM Cards Control
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Retained players are automatically excluded from the auction pool. Admin can set how many RTM cards each team gets below.
                </p>
              </div>

              {!isRetentionsLocked && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePublishRetentions(!auction.retentionsPublished)}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-extrabold text-xs uppercase tracking-wider cursor-pointer ${
                      auction.retentionsPublished
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20'
                    }`}
                  >
                    <Eye className="w-4 h-4" />
                    {auction.retentionsPublished ? 'Set Private' : 'PUBLISH RETENTIONS'}
                  </button>
                </div>
              )}
            </div>

            {/* Admin RTM Cards per Team & Max Retentions Configuration */}
            <div className="rounded-3xl bg-slate-900/90 border border-purple-500/30 p-5 space-y-4">
              <form
                onSubmit={handleSaveRtmConfig}
                className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-slate-800/80"
              >
                <div>
                  <h4 className="font-display text-sm font-extrabold text-white">
                    RTM (Right To Match) & Retention Limits — Global & Individual Per-Team Setup
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Set a default RTM limit for all teams, click <strong>Auto-Set IPL RTMs</strong> (Max − Retained), or edit each team's individual RTM count below!
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-purple-300 mb-1">
                      Default RTM / Team
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="15"
                      value={maxRtmConfigInput}
                      onChange={e => setMaxRtmConfigInput(e.target.value)}
                      className="w-28 rounded-xl bg-slate-950 border border-purple-500/40 px-3 py-2 text-sm font-mono-num text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-300 mb-1">
                      Max Retentions / Team
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="25"
                      value={maxRetConfigInput}
                      onChange={e => setMaxRetConfigInput(e.target.value)}
                      className="w-32 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm font-mono-num text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busyAction}
                    className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Apply to All Teams
                  </button>
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={handleAutoCalculateTeamRtms}
                    className="px-4 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 text-amber-300 font-extrabold text-xs uppercase tracking-wider cursor-pointer"
                    title="Sets each team's RTM cards to (Max Retentions minus Retained Players)"
                  >
                    ⚡ Auto-Set IPL RTMs (Max − Retained)
                  </button>
                </div>
              </form>

              {/* Individual Per-Team Editable RTM Cards Strip */}
              {(auction.teams?.length || 0) > 0 && (
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-purple-300 mb-2.5">
                    Individual Team RTM Cards (Set a different RTM count for each team):
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
                    {(auction.teams || []).map(team => (
                      <div
                        key={team.id}
                        className="p-2.5 rounded-2xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-2"
                        style={{ borderLeftWidth: '4px', borderLeftColor: team.primaryColor }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <TeamLogo team={team} size="xs" />
                          <div className="min-w-0">
                            <div className="text-xs font-extrabold text-white truncate">
                              {team.shortName || team.name}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Ret: {team.retentionsCount} • Left:{' '}
                              <strong className="text-purple-300">{team.rtmRemaining}</strong>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateTeamRtm(team, Math.max(0, (team.rtmTotal || 0) - 1))
                            }
                            className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center cursor-pointer"
                            title="Decrease RTM Cards"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min="0"
                            max="15"
                            value={team.rtmTotal ?? 0}
                            onChange={e => handleUpdateTeamRtm(team, e.target.value)}
                            className="w-10 h-6 rounded-lg bg-purple-950/60 border border-purple-500/40 text-center font-mono-num font-extrabold text-xs text-purple-200 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateTeamRtm(team, (team.rtmTotal || 0) + 1)}
                            className="w-6 h-6 rounded-lg bg-purple-600/40 hover:bg-purple-600 text-white font-bold text-xs flex items-center justify-center cursor-pointer"
                            title="Increase RTM Cards"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Manual Team-by-Team Retention Entry (Allowed only before LIVE) */}
            {!isRetentionsLocked && (
              <form
                onSubmit={handleCreateRetention}
                className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                      Select Team
                    </label>
                    <select
                      value={retTeamId || auction.teams?.[0]?.id || ''}
                      onChange={e => setRetTeamId(e.target.value)}
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                    >
                      {(auction.teams || []).map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.retentionsCount}/{auction.maxRetentionsPerTeam} retained)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                      Retained Player / Item Name
                    </label>
                    <input
                      type="text"
                      value={retPlayerName}
                      onChange={e => setRetPlayerName(e.target.value)}
                      placeholder="e.g. Virat Kohli"
                      required
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                      Retention Price / Amount
                    </label>
                    <input
                      type="text"
                      value={retAmountInput}
                      onChange={e => setRetAmountInput(e.target.value)}
                      placeholder={cur === 'INR' ? 'e.g. 18Cr' : 'e.g. 65M'}
                      required
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm font-mono-num text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider cursor-pointer"
                  >
                    + Add Retention
                  </button>
                </div>

                {/* Quick Price Preset Pills for Manual Entry */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Quick Price Slabs:
                  </span>
                  {getRetentionPricePresets().map(preset => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setRetAmountInput(preset.value)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono-num font-bold border transition cursor-pointer ${
                        retAmountInput === preset.value
                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                          : 'bg-slate-950 text-amber-300 border-slate-800 hover:border-amber-500/40'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </form>
            )}

            {/* DRAG & DROP AVAILABLE PLAYERS POOL FOR RETENTION */}
            {!isRetentionsLocked && (
              <div className="rounded-3xl bg-slate-900/90 border border-amber-500/30 p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-extrabold uppercase tracking-wider">
                        Drag & Drop Enabled
                      </span>
                      <h4 className="font-display text-sm font-bold text-white uppercase tracking-wider">
                        Available Players Pool (Drag onto any Team Card below to Retain & Set Price)
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Drag any player chip below and drop it onto a franchise card, or click{' '}
                      <span className="text-amber-300 font-bold">Set Price</span> to choose a team & price immediately.
                    </p>
                  </div>
                  <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={retPoolSearch}
                      onChange={e => setRetPoolSearch(e.target.value)}
                      placeholder="Search player, role, or pool..."
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 pl-9 pr-3.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                {(() => {
                  const retainedNamesSet = new Set(
                    (auction.teams || []).flatMap(t =>
                      (t.retentions || []).map(r => (r.playerName || '').toLowerCase().trim())
                    )
                  );
                  const availablePoolItems = (auction.items || []).filter(item => {
                    if (item.status === 'SOLD') return false;
                    if (retainedNamesSet.has((item.name || '').toLowerCase().trim())) return false;
                    if (!retPoolSearch.trim()) return true;
                    const q = retPoolSearch.toLowerCase();
                    return (
                      (item.name || '').toLowerCase().includes(q) ||
                      (item.roleOrPosition || '').toLowerCase().includes(q) ||
                      (item.poolCode || '').toLowerCase().includes(q) ||
                      (item.country || '').toLowerCase().includes(q)
                    );
                  });

                  if (availablePoolItems.length === 0) {
                    return (
                      <div className="py-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                        No matching players found in the auction pool. You can still type any player name in the manual box above!
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-64 overflow-y-auto pr-1">
                      {availablePoolItems.slice(0, 60).map(item => {
                        const defaultTargetTeam =
                          (auction.teams || []).find(t => t.id === retTeamId) ||
                          auction.teams?.[0];
                        return (
                          <div
                            key={item.id}
                            draggable
                            onDragStart={e => {
                              setDraggedRetPayload({
                                kind: 'POOL_PLAYER',
                                itemId: item.id,
                                playerName: item.name,
                                basePrice: item.basePrice
                              });
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => {
                              setDraggedRetPayload(null);
                              setDragOverTeamId(null);
                            }}
                            className="group p-2.5 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/50 flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing transition select-none"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate flex items-center gap-1">
                                <span className="text-slate-500 group-hover:text-amber-400">⋮⋮</span>
                                <span className="truncate">{item.name}</span>
                                <OverseasPlane playerName={item.name} auction={auction} />
                              </div>
                              <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                {item.poolCode ? `[${item.poolCode}] ` : ''}
                                {item.roleOrPosition} • Base {formatCurrency(item.basePrice, cur)}
                              </div>
                            </div>
                            {defaultTargetTeam && (
                              <button
                                type="button"
                                onClick={() =>
                                  setRetentionPriceModal({
                                    mode: 'CREATE',
                                    teamId: defaultTargetTeam.id,
                                    teamName: defaultTargetTeam.name,
                                    playerName: item.name,
                                    amountInput: getDefaultRetentionPriceString(defaultTargetTeam)
                                  })
                                }
                                className="shrink-0 px-2 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-extrabold text-[10px] uppercase tracking-wider transition cursor-pointer"
                                title="Click to choose team & set retention price"
                              >
                                Set Price
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Team-by-Team Retention Board (Drop Zones) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(auction.teams || []).map(team => {
                const isDropActive = dragOverTeamId === team.id && !isRetentionsLocked;
                return (
                  <div
                    key={team.id}
                    onDragOver={e => {
                      if (isRetentionsLocked) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverTeamId !== team.id) setDragOverTeamId(team.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverTeamId === team.id) setDragOverTeamId(null);
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      handleDropOnTeamCard(team);
                    }}
                    className={`rounded-2xl bg-slate-900/90 border p-5 flex flex-col justify-between gap-4 transition ${
                      isDropActive
                        ? 'border-amber-400 ring-2 ring-amber-400/50 bg-amber-500/5 scale-[1.01]'
                        : 'border-slate-800'
                    }`}
                    style={{ borderTopWidth: '4px', borderTopColor: team.primaryColor }}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <TeamLogo team={team} size="sm" />
                          <div>
                            <div className="font-display font-bold text-white text-sm">
                              {team.name}
                            </div>
                            <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
                              <span>
                                Retained: {team.retentionsCount} / {auction.maxRetentionsPerTeam}
                              </span>
                              <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/35 text-purple-300 font-bold text-[10px]">
                                <span>RTM: {team.rtmRemaining}/</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateTeamRtm(team, Math.max(0, (team.rtmTotal || 0) - 1))
                                  }
                                  className="w-4 h-4 rounded bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center cursor-pointer"
                                  title="Decrease team RTM cards"
                                >
                                  −
                                </button>
                                <span className="font-mono-num text-white px-0.5">
                                  {team.rtmTotal ?? 0}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateTeamRtm(team, (team.rtmTotal || 0) + 1)
                                  }
                                  className="w-4 h-4 rounded bg-purple-600/50 hover:bg-purple-500 text-white flex items-center justify-center cursor-pointer"
                                  title="Increase team RTM cards"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase text-slate-400">Remaining Purse</div>
                          <div className="font-mono-num text-sm font-extrabold text-amber-400">
                            {formatCurrency(team.remainingPurse, cur)}
                          </div>
                        </div>
                      </div>

                      {!isRetentionsLocked && (
                        <div
                          className={`mt-3 rounded-xl border border-dashed px-3 py-2 text-center text-[11px] font-semibold transition ${
                            isDropActive
                              ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                              : 'border-slate-800/90 bg-slate-950/50 text-slate-400'
                          }`}
                        >
                          {isDropActive
                            ? `Release to retain for ${team.shortName || team.name} & set price`
                            : 'Drop player here to retain & set price'}
                        </div>
                      )}

                      <div className="mt-3 space-y-2">
                        {(team.retentions || []).map(ret => (
                          <div
                            key={ret.id}
                            draggable={!isRetentionsLocked}
                            onDragStart={e => {
                              if (isRetentionsLocked) return;
                              setDraggedRetPayload({
                                kind: 'EXISTING_RETENTION',
                                retentionId: ret.id,
                                fromTeamId: team.id,
                                playerName: ret.playerName,
                                amount: ret.amount
                              });
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => {
                              setDraggedRetPayload(null);
                              setDragOverTeamId(null);
                            }}
                            className={`p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 ${
                              !isRetentionsLocked ? 'cursor-grab active:cursor-grabbing hover:border-slate-700' : ''
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white flex items-center gap-1 truncate">
                                {!isRetentionsLocked && (
                                  <span className="text-slate-500 text-[10px]">⋮⋮</span>
                                )}
                                <span className="truncate">{ret.playerName}</span>
                                <OverseasPlane playerName={ret.playerName} auction={auction} />
                              </div>
                              <div className="text-xs font-mono-num text-amber-400 font-bold">
                                {formatCurrency(ret.amount, cur)}
                              </div>
                            </div>
                            {!isRetentionsLocked && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingRetention({
                                      ...ret,
                                      teamId: team.id,
                                      amountInput: formatCurrency(ret.amount, cur)
                                    })
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                                  title="Set or Change Retention Price"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  Set Price
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRetention(ret.id)}
                                  className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 cursor-pointer"
                                  title="Delete Retention, Refund Purse & Return to Pool"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                        {(!team.retentions || team.retentions.length === 0) && (
                          <div className="py-3 text-center text-xs text-slate-500">
                            No retentions entered for {team.name}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Total Retention Spend:</span>
                      <span className="font-mono-num font-bold text-white">
                        {formatCurrency(team.retentionSpend, cur)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 5: TEAM & PURSE MANAGEMENT
           =================================================================== */}
        {activeTab === 'TEAMS' && (
          <div className="space-y-6">
            {/* Add Team Form */}
            <form
              onSubmit={handleAddTeam}
              className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 space-y-4"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-display text-lg font-bold text-white">
                    Add Team to Auction
                  </h3>
                  <p className="text-xs text-slate-400">
                    Add teams manually. Known clubs automatically receive official logos & colours, or customize below.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-7 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Team Name
                  </label>
                  <input
                    type="text"
                    value={newTeamName}
                    onChange={e => setNewTeamName(e.target.value)}
                    placeholder="e.g. Team Alpha / Borussia Dortmund"
                    required
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Team Code (Login)
                  </label>
                  <input
                    type="text"
                    value={newTeamCode}
                    onChange={e => setNewTeamCode(e.target.value.toUpperCase())}
                    placeholder="Auto (e.g. ALP)"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm font-mono-num uppercase text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Team PIN (Login)
                  </label>
                  <input
                    type="text"
                    value={newTeamPin}
                    onChange={e => setNewTeamPin(e.target.value)}
                    placeholder="Auto (e.g. 1011)"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm font-mono-num text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-purple-300 mb-1">
                    RTM Cards
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="15"
                    value={newTeamRtmCards}
                    onChange={e => setNewTeamRtmCards(e.target.value)}
                    placeholder={`Default (${auction.maxRtmPerTeam || 0})`}
                    className="w-full rounded-xl bg-slate-950 border border-purple-500/40 px-3 py-2 text-sm font-mono-num text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                      Color 1
                    </label>
                    <input
                      type="color"
                      value={newTeamPrimary}
                      onChange={e => setNewTeamPrimary(e.target.value)}
                      className="w-full h-9 rounded-xl bg-slate-950 border border-slate-800 p-1 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                      Color 2
                    </label>
                    <input
                      type="color"
                      value={newTeamSecondary}
                      onChange={e => setNewTeamSecondary(e.target.value)}
                      className="w-full h-9 rounded-xl bg-slate-950 border border-slate-800 p-1 cursor-pointer"
                    />
                  </div>
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider cursor-pointer"
                  >
                    + Add Team
                  </button>
                </div>
              </div>

              {/* Team Logo Upload / URL Option */}
              <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[240px]">
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                    Team Logo / Crest (Upload Image or Enter URL)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTeamLogo}
                      onChange={e => setNewTeamLogo(e.target.value)}
                      placeholder="Paste image URL or click Upload Logo..."
                      className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs text-white placeholder-slate-600"
                    />
                    <label className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0 border border-slate-700">
                      <Camera className="w-3.5 h-3.5" />
                      <span>Upload Logo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = ev => {
                            setNewTeamLogo(ev.target?.result);
                          };
                          reader.readAsDataURL(file);
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
                {newTeamLogo && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 shrink-0">
                    <img
                      src={newTeamLogo}
                      alt="Logo Preview"
                      className="w-8 h-8 rounded-lg object-contain bg-slate-900 border border-slate-700 p-0.5"
                    />
                    <span className="text-[11px] text-slate-400">Custom Logo</span>
                    <button
                      type="button"
                      onClick={() => setNewTeamLogo('')}
                      className="text-xs text-rose-400 hover:text-rose-300 font-bold"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            </form>

            {/* Admin-Only Master Team Login Credentials Directory (Code + PIN) */}
            <div className="rounded-3xl bg-slate-900/90 border border-amber-500/30 p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-extrabold uppercase tracking-wider mb-1">
                    <Lock className="w-3 h-3" /> Admin-Only Confidential Directory
                  </div>
                  <h3 className="font-display text-lg font-bold text-white">
                    All Team Login Details & Per-Team RTM Cards
                  </h3>
                  <p className="text-xs text-slate-400">
                    Only Admins can view, copy, or reset these login credentials, and set a different RTM card count for each team.
                  </p>
                </div>
                {(auction.teams?.length || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const text = (auction.teams || [])
                        .map(
                          t =>
                            `${t.name} | Team Code: ${t.code} | PIN: ${t.pin || 'N/A'}`
                        )
                        .join('\n');
                      navigator.clipboard?.writeText(text);
                      showNotice('Copied all team login credentials (Code + PIN) to clipboard!');
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Copy All Team Logins
                  </button>
                )}
              </div>

              {(auction.teams?.length || 0) === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 bg-slate-950/60 rounded-2xl border border-slate-800">
                  No teams added to this auction yet. Use the form above to add teams manually.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 uppercase">
                        <th className="py-2.5 px-3">Team</th>
                        <th className="py-2.5 px-3">Team Code</th>
                        <th className="py-2.5 px-3">Team PIN</th>
                        <th className="py-2.5 px-3">RTM Cards (Left / Total)</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {(auction.teams || []).map(t => (
                        <tr key={t.id} className="hover:bg-slate-950/60">
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2.5">
                              <div className="relative group/logo shrink-0">
                                <TeamLogo team={t} size="xs" />
                                <label
                                  className="absolute inset-0 bg-black/75 rounded opacity-0 group-hover/logo:opacity-100 flex items-center justify-center text-amber-300 cursor-pointer transition-opacity"
                                  title="Upload new team logo"
                                >
                                  <Camera className="w-3 h-3" />
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={e => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      const reader = new FileReader();
                                      reader.onload = async ev => {
                                        try {
                                          await apiFetch(`/api/auctions/${auctionId}/teams/${t.id}`, {
                                            method: 'PATCH',
                                            body: JSON.stringify({ logoUrl: ev.target?.result })
                                          });
                                          showNotice(`Logo updated for ${t.name}.`);
                                        } catch (err) {
                                          showNotice(err.message, 'error');
                                        }
                                      };
                                      reader.readAsDataURL(file);
                                    }}
                                    className="hidden"
                                  />
                                </label>
                              </div>
                              <span className="font-bold text-white">{t.name}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-mono-num font-extrabold text-sm px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-amber-400">
                              {t.code}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-mono-num font-extrabold text-sm px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-emerald-400">
                              {t.pin || '****'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-slate-950 border border-purple-500/40">
                              <span className="font-mono-num font-bold text-xs text-purple-300">
                                Left: {t.rtmRemaining ?? 0} /
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateTeamRtm(t, Math.max(0, (t.rtmTotal || 0) - 1))
                                }
                                className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center cursor-pointer"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                min="0"
                                max="15"
                                value={t.rtmTotal ?? 0}
                                onChange={e => handleUpdateTeamRtm(t, e.target.value)}
                                className="w-9 h-5 rounded bg-purple-950/60 border border-purple-500/40 text-center font-mono-num font-extrabold text-xs text-white focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateTeamRtm(t, (t.rtmTotal || 0) + 1)}
                                className="w-5 h-5 rounded bg-purple-600/50 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            {t.disabled ? (
                              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                                DISABLED
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                                ACTIVE
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right space-x-2">
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(
                                  `${auction.name} — ${t.name}\nTeam Code: ${t.code}\nTeam PIN: ${t.pin}`
                                );
                                showNotice(`Copied ${t.name} login details to clipboard.`);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] cursor-pointer"
                            >
                              Copy Login
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setEditingTeam({
                                  ...t,
                                  startingPurseInput: formatCurrency(t.startingPurse, cur),
                                  rtmCardsTotalInput: String(
                                    t.rtmTotal ?? auction.maxRtmPerTeam ?? 0
                                  )
                                })
                              }
                              className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-300 font-bold text-[11px] cursor-pointer"
                            >
                              Edit / RTM / PIN
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Teams Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(auction.teams || []).map(team => (
                <div
                  key={team.id}
                  className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-4"
                  style={{ borderLeftWidth: '5px', borderLeftColor: team.primaryColor }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="relative group/logo shrink-0">
                        <TeamLogo team={team} size="md" />
                        <label
                          className="absolute inset-0 bg-black/70 rounded-xl opacity-0 group-hover/logo:opacity-100 flex flex-col items-center justify-center text-[9px] font-bold text-amber-300 cursor-pointer transition-opacity"
                          title="Click to upload team logo"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Logo</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = async ev => {
                                const base64 = ev.target?.result;
                                try {
                                  await apiFetch(`/api/auctions/${auctionId}/teams/${team.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ logoUrl: base64 })
                                  });
                                  showNotice(`Logo updated for ${team.name}.`);
                                } catch (err) {
                                  showNotice(err.message, 'error');
                                }
                              };
                              reader.readAsDataURL(file);
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-display text-lg font-extrabold text-white">
                            {team.name}
                          </h4>
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/35 text-[10px] font-extrabold">
                            <span>RTM: {team.rtmRemaining}/</span>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateTeamRtm(team, Math.max(0, (team.rtmTotal || 0) - 1))
                              }
                              className="w-4 h-4 rounded bg-slate-950 hover:bg-slate-800 text-white flex items-center justify-center cursor-pointer"
                              title="Decrease RTM cards"
                            >
                              −
                            </button>
                            <span className="font-mono-num text-white px-0.5">
                              {team.rtmTotal ?? 0}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateTeamRtm(team, (team.rtmTotal || 0) + 1)
                              }
                              className="w-4 h-4 rounded bg-purple-600/50 hover:bg-purple-500 text-white flex items-center justify-center cursor-pointer"
                              title="Increase RTM cards"
                            >
                              +
                            </button>
                          </div>
                          {team.disabled && (
                            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                              DISABLED
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-mono-num text-slate-400 mt-0.5">
                          Login Code: <strong className="text-amber-400">{team.code}</strong> • PIN:{' '}
                          <strong className="text-emerald-400">{team.pin || '****'}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] uppercase text-slate-400">Remaining Purse</div>
                      <div className="font-mono-num text-xl font-extrabold text-amber-400">
                        {formatCurrency(team.remainingPurse, cur)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Start: {formatCurrency(team.startingPurse, cur)}
                      </div>
                    </div>
                  </div>

                  {/* Team Actions */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setPurseModalTeam(team);
                          setPurseAdjType('ADD');
                          setPurseAdjAmount('');
                          setPurseAdjReason('');
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold cursor-pointer"
                      >
                        <Coins className="w-3.5 h-3.5" />
                        Add / Deduct Funds
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setEditingTeam({
                            ...team,
                            startingPurseInput: formatCurrency(team.startingPurse, cur),
                            rtmCardsTotalInput: String(
                              team.rtmTotal ?? auction.maxRtmPerTeam ?? 0
                            )
                          })
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit / RTM / PIN
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleTeamDisabled(team)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                      >
                        {team.disabled ? 'Enable Team' : 'Disable Team'}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteTeam(team.id)}
                      className="p-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 cursor-pointer"
                      title="Remove Team"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 6: POOLS, INCREMENT ENGINE & AUCTION SETTINGS
           =================================================================== */}
        {activeTab === 'SETTINGS' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Pools / Categories Manager */}
            <div className="lg:col-span-6 rounded-3xl bg-slate-900/90 border border-slate-800 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold text-white">
                  Pools / Categories Configuration
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('POOL_SETS')}
                  className="text-xs font-bold text-amber-400 hover:text-amber-300 cursor-pointer"
                >
                  Open Pool Sets Builder →
                </button>
              </div>
              <form onSubmit={handleAddPool} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={newPoolName}
                  onChange={e => setNewPoolName(e.target.value)}
                  placeholder="New Pool Name"
                  required
                  className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  value={newPoolPrice}
                  onChange={e => setNewPoolPrice(e.target.value)}
                  placeholder="Default Base Price (e.g. 25M)"
                  required
                  className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs font-mono-num text-white"
                />
                <button
                  type="submit"
                  className="py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase cursor-pointer"
                >
                  + Add Pool
                </button>
              </form>

              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {(auction.pools || []).map(pool => {
                  const poolItems = (auction.items || []).filter(
                    it =>
                      it.poolId === pool.id ||
                      String(it.poolName).toLowerCase() === String(pool.name).toLowerCase()
                  );
                  const queuedInPool = poolItems.filter(it => it.status === 'QUEUED');
                  const soldInPool = poolItems.filter(it => it.status === 'SOLD');
                  const unsoldInPool = poolItems.filter(
                    it => it.status === 'UNSOLD' || it.status === 'PERMANENTLY_UNSOLD'
                  );

                  return (
                    <div
                      key={pool.id}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          <span>{pool.name}</span>
                          {pool.isLegendPool && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-extrabold uppercase">
                              Marquee
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono-num text-amber-400 mt-0.5">
                          Default Base: {formatCurrency(pool.defaultBasePrice, cur)}
                          <span className="text-slate-400 ml-2 font-sans">
                            ({queuedInPool.length} Available
                            {soldInPool.length > 0 ? `, ${soldInPool.length} Sold` : ''}
                            {unsoldInPool.length > 0 ? `, ${unsoldInPool.length} Unsold` : ''})
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={busyAction || (queuedInPool.length === 0 && unsoldInPool.length === 0)}
                          onClick={() => handleClearPool(pool)}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 disabled:opacity-35 text-rose-300 border border-rose-500/30 text-[11px] font-bold cursor-pointer inline-flex items-center gap-1"
                          title="Clear all available/unsold players from this pool"
                        >
                          <Trash2 className="w-3 h-3 text-rose-400" />
                          Clear Pool
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePool(pool.id)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/30 text-slate-400 hover:text-rose-400 cursor-pointer"
                          title="Delete Pool Set"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Configurable Bid Increment Engine */}
            <div className="lg:col-span-6 rounded-3xl bg-slate-900/90 border border-slate-800 p-6 space-y-4">
              <div>
                <h3 className="font-display text-lg font-bold text-white">
                  Configurable Bid Increment Engine
                </h3>
                <p className="text-xs text-slate-400">
                  Define price-range increments (e.g. IPL ₹50L above ₹2Cr, Storage Wars $2,000 flat, Football tiered millions).
                </p>
              </div>

              <form
                onSubmit={handleAddIncrementRule}
                className="grid grid-cols-1 sm:grid-cols-4 gap-2.5"
              >
                <input
                  type="text"
                  value={incMinInput}
                  onChange={e => setIncMinInput(e.target.value)}
                  placeholder="From (e.g. 0)"
                  required
                  className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs font-mono-num text-white"
                />
                <input
                  type="text"
                  value={incMaxInput}
                  onChange={e => setIncMaxInput(e.target.value)}
                  placeholder="To (Blank = Above)"
                  className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs font-mono-num text-white"
                />
                <input
                  type="text"
                  value={incStepInput}
                  onChange={e => setIncStepInput(e.target.value)}
                  placeholder="Increment (e.g. 5M)"
                  required
                  className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs font-mono-num text-white"
                />
                <button
                  type="submit"
                  className="py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase cursor-pointer"
                >
                  + Add Rule
                </button>
              </form>

              <div className="space-y-2">
                {(auction.incrementRules || []).map((rule, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                  >
                    <div className="text-xs font-mono-num text-white">
                      {rule.max
                        ? `${formatCurrency(rule.min, cur)} – ${formatCurrency(rule.max, cur)}`
                        : `Above ${formatCurrency(rule.min, cur)}`}{' '}
                      <span className="text-amber-400 font-extrabold ml-2">
                        → +{formatCurrency(rule.increment, cur)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveIncrementRule(idx)}
                      className="text-slate-500 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Full-Width: Restart Auction Section (Requires typing "I confirm") */}
            <div className="lg:col-span-12 rounded-3xl bg-rose-950/20 border border-rose-500/40 p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-extrabold uppercase tracking-wider mb-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Protected Action
                  </div>
                  <h3 className="font-display text-lg font-bold text-white">
                    Restart Auction Section
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5 max-w-2xl">
                    Restarting the auction clears all bids, sales, and manual purse adjustments, returns all items to the queue at their original base prices, restores team purses, and sets the auction back to <strong>READY</strong>. To prevent accidental resets, this action will only execute if you type <code className="px-1.5 py-0.5 rounded bg-slate-950 text-amber-300 font-mono-num font-bold">I confirm</code> below.
                  </p>
                </div>
              </div>

              <form
                onSubmit={handleRestartAuction}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1"
              >
                <input
                  type="text"
                  value={restartConfirmText}
                  onChange={e => setRestartConfirmText(e.target.value)}
                  placeholder='Type "I confirm" to enable restart'
                  className="w-full sm:w-80 rounded-xl bg-slate-950 border border-rose-500/40 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-rose-400"
                />
                <button
                  type="submit"
                  disabled={
                    busyAction ||
                    restartConfirmText.trim().toLowerCase() !== 'i confirm'
                  }
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-35 disabled:cursor-not-allowed text-white font-extrabold text-xs uppercase tracking-wider transition-all cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  Restart Auction
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 7: RESULTS DASHBOARD & FULL AUDIT LOG
           =================================================================== */}
        {activeTab === 'RESULTS_AUDIT' && (
          <div className="space-y-8">
            {/* Final Results Header & Excel / CSV Export */}
            <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-extrabold text-white">
                  Final Results & Complete Squad Summary
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Complete financial summary, retentions, purchases, RTM acquisitions, unsold items, and audit history.
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => exportAuctionResults(auction, 'xlsx')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Export Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => exportAuctionResults(auction, 'csv')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Export CSV (.csv)
                </button>
              </div>
            </div>

            {/* Most Expensive Purchases Highlight */}
            {auction.soldItems?.length > 0 && (
              <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6">
                <h4 className="font-display text-sm font-extrabold uppercase tracking-wider text-amber-400 mb-4">
                  Most Expensive Auction Purchases
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[...auction.soldItems]
                    .sort((a, b) => (b.soldAmount || 0) - (a.soldAmount || 0))
                    .slice(0, 4)
                    .map(item => (
                      <div
                        key={item.id}
                        className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center gap-3"
                      >
                        <ItemImage
                          item={item}
                          className="w-14 h-14 rounded-xl object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate">
                            {item.name}
                            <OverseasPlane playerName={item.name} auction={auction} />
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {item.soldToTeam?.name}
                          </div>
                          <div className="font-mono-num text-base font-extrabold text-amber-400">
                            {formatCurrency(item.soldAmount, cur)}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Team-by-Team Results Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {(auction.teams || []).map(team => (
                <div
                  key={team.id}
                  className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-4"
                  style={{ borderTopWidth: '4px', borderTopColor: team.primaryColor }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <TeamLogo team={team} size="md" />
                      <div>
                        <h4 className="font-display text-lg font-extrabold text-white">
                          {team.name}
                        </h4>
                        <div className="text-xs text-slate-400">
                          Squad: {team.squadCount} ({team.retentionsCount} Retained,{' '}
                          {team.purchasesCount} Purchased)
                          {(team.rtmTotal > 0 || (auction.maxRtmPerTeam || 0) > 0) && (
                            <span className="ml-2 text-purple-300 font-bold">
                              • RTM: {team.rtmRemaining}/{team.rtmTotal}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right font-mono-num">
                      <div className="text-xs text-slate-400">
                        Start: {formatCurrency(team.startingPurse, cur)}
                      </div>
                      <div className="text-xs text-rose-400">
                        Spent: {formatCurrency(team.totalSpent, cur)}
                      </div>
                      <div className="text-sm font-extrabold text-emerald-400">
                        Final Purse: {formatCurrency(team.remainingPurse, cur)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {(team.retentions || []).map(r => (
                      <div
                        key={r.id}
                        className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs"
                      >
                        <span className="font-bold text-amber-200">
                          {r.playerName}
                          <OverseasPlane playerName={r.playerName} auction={auction} />{' '}
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 ml-1">
                            RETENTION
                          </span>
                        </span>
                        <span className="font-mono-num font-bold text-amber-400">
                          {formatCurrency(r.amount, cur)}
                        </span>
                      </div>
                    ))}
                    {(team.purchases || []).map(p => (
                      <div
                        key={p.id}
                        className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <span className="text-white font-medium">
                          {p.name}
                          <OverseasPlane playerName={p.name} auction={auction} />{' '}
                          <span className="text-[10px] text-slate-500">({p.poolName})</span>
                          {p.soldViaRtm && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[9px] font-extrabold">
                              RTM
                            </span>
                          )}
                        </span>
                        <span className="font-mono-num font-bold text-emerald-400">
                          {formatCurrency(p.amount, cur)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Complete Immutable Audit Log */}
            <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-display text-lg font-bold text-white">
                  Complete Auction Audit Log ({filteredAuditLogs.length})
                </h3>
                <input
                  type="text"
                  value={auditSearch}
                  onChange={e => setAuditSearch(e.target.value)}
                  placeholder="Filter by action, admin, role, or entity..."
                  className="rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-1.5 text-xs text-white w-72"
                />
              </div>

              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase">
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Admin</th>
                      <th className="py-2.5 px-3">Role</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 px-3">Entity</th>
                      <th className="py-2.5 px-3">Previous Value</th>
                      <th className="py-2.5 px-3">New Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredAuditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-950/60">
                        <td className="py-2 px-3 font-mono-num text-slate-400 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-2 px-3 font-bold text-white">{log.userName}</td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-bold text-[10px]">
                            {log.userRole}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-bold text-emerald-400">{log.action}</td>
                        <td className="py-2 px-3 text-slate-300">
                          {log.entityType}: {log.entityName || '-'}
                        </td>
                        <td className="py-2 px-3 font-mono-num text-[11px] text-slate-400 max-w-xs truncate">
                          {log.previousValue ? JSON.stringify(log.previousValue) : '-'}
                        </td>
                        <td className="py-2 px-3 font-mono-num text-[11px] text-slate-300 max-w-xs truncate">
                          {log.newValue ? JSON.stringify(log.newValue) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* =====================================================================
          MODALS
         ===================================================================== */}

      {/* RTM (RIGHT TO MATCH) LIVE MODAL */}
      {showRtmModal && activeItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleRtmSubmit}
            className="w-full max-w-md rounded-3xl bg-slate-900 border border-purple-500/40 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-extrabold uppercase">
                    Right To Match (RTM)
                  </span>
                </div>
                <h3 className="font-display text-lg font-bold text-white mt-1">
                  Exercise RTM Card for {activeItem.name}
                </h3>
              </div>
              <button type="button" onClick={() => setShowRtmModal(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Current winning bid:{' '}
              <strong className="text-white font-mono-num">
                {formatCurrency(activeItem.currentBid || activeItem.basePrice, cur)}
              </strong>{' '}
              ({leadingTeam?.name || 'Opening Bid'}). Select the franchise exercising its RTM card and confirm the final matched amount.
            </p>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Team Exercising RTM Card
              </label>
              <select
                value={rtmTeamId}
                onChange={e => setRtmTeamId(e.target.value)}
                required
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
              >
                <option value="">Select Team Exercising RTM...</option>
                {(auction.teams || [])
                  .filter(t => !t.disabled)
                  .map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} (
                      {(t.rtmRemaining || 0) > 0
                        ? `RTM Left: ${t.rtmRemaining}/${t.rtmTotal}`
                        : 'Auto-Grant RTM Card'}{' '}
                      • Purse: {formatCurrency(t.remainingPurse, cur)})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                RTM Match / Final Amount
              </label>
              <input
                type="text"
                value={rtmAmountInput}
                onChange={e => setRtmAmountInput(e.target.value)}
                placeholder="e.g. 14Cr"
                required
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm font-mono-num text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRtmModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyAction || !rtmTeamId}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-extrabold text-xs uppercase cursor-pointer"
              >
                Confirm Sold via RTM
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ASSIGN EXISTING PLAYERS TO POOL SET MODAL */}
      {assignModalPool && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleAssignItemsToPool}
            className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-700 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-white">
                  Assign Players to Pool Set: {assignModalPool.name}
                </h3>
                <p className="text-xs text-slate-400">
                  Select players from other pools to move into {assignModalPool.name}.
                </p>
              </div>
              <button type="button" onClick={() => setAssignModalPool(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              {(auction.items || [])
                .filter(i => i.poolId !== assignModalPool.id && i.poolName !== assignModalPool.name)
                .map(item => {
                  const checked = assignSelectedItemIds.includes(item.id);
                  return (
                    <label
                      key={item.id}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer ${
                        checked
                          ? 'bg-indigo-500/15 border-indigo-500/40'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            if (e.target.checked) {
                              setAssignSelectedItemIds(prev => [...prev, item.id]);
                            } else {
                              setAssignSelectedItemIds(prev => prev.filter(id => id !== item.id));
                            }
                          }}
                          className="accent-amber-500"
                        />
                        <span className="text-xs font-bold text-white truncate">
                          {item.name}
                          <OverseasPlane playerName={item.name} auction={auction} />
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {item.poolName} • {formatCurrency(item.basePrice, cur)}
                      </span>
                    </label>
                  );
                })}
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={assignSyncPrice}
                onChange={e => setAssignSyncPrice(e.target.checked)}
                className="accent-amber-500"
              />
              Also update selected players' Base Price to {assignModalPool.name} default (
              {formatCurrency(assignModalPool.defaultBasePrice, cur)})
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAssignModalPool(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={assignSelectedItemIds.length === 0 || busyAction}
                className="px-5 py-2 rounded-xl bg-amber-500 disabled:opacity-40 text-slate-950 font-extrabold text-xs uppercase cursor-pointer"
              >
                Assign {assignSelectedItemIds.length} Player(s)
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EDIT BID MODAL */}
      {showEditBidModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleManualBidSubmit}
            className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">
                Manual Bid Entry / Correction (EDIT BID)
              </h3>
              <button type="button" onClick={() => setShowEditBidModal(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Bidding Team
              </label>
              <select
                value={manualBidTeamId}
                onChange={e => setManualBidTeamId(e.target.value)}
                required
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
              >
                {(auction.teams || [])
                  .filter(t => !t.disabled)
                  .map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} (Purse: {formatCurrency(t.remainingPurse, cur)})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Bid Amount
              </label>
              <input
                type="text"
                value={manualBidInput}
                onChange={e => setManualBidInput(e.target.value)}
                placeholder="e.g. 90M"
                required
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm font-mono-num text-white"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={manualBidOverride}
                onChange={e => setManualBidOverride(e.target.checked)}
                className="accent-amber-500"
              />
              Authorized Admin Override (allow custom step / correction; still enforces purse limit)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowEditBidModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs uppercase cursor-pointer"
              >
                Apply Bid
              </button>
            </div>
          </form>
        </div>
      )}

      {/* WITHDRAW MODAL */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">
                Withdraw Active Item
              </h3>
              <button type="button" onClick={() => setShowWithdrawModal(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <p className="text-xs text-slate-300">
              Withdrawing <strong>{activeItem?.name}</strong> makes no purse changes and logs the withdrawal in the audit log. Choose where to send this item:
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleWithdraw('QUEUE')}
                className="py-3 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-extrabold text-xs uppercase cursor-pointer"
              >
                Return to Queue
              </button>
              <button
                type="button"
                onClick={() => handleWithdraw('UNSOLD')}
                className="py-3 px-4 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-extrabold text-xs uppercase cursor-pointer"
              >
                Send to Unsold Pool
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RE-AUCTION MODAL */}
      {reauctionModalItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">
                Re-Auction: {reauctionModalItem.name}
              </h3>
              <button type="button" onClick={() => setReauctionModalItem(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Original Base Price:{' '}
              <strong className="text-white font-mono-num">
                {formatCurrency(
                  reauctionModalItem.originalBasePrice || reauctionModalItem.basePrice,
                  cur
                )}
              </strong>
              . You can keep the original base price or override it below (every override is logged).
            </p>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Re-Auction Base Price
              </label>
              <input
                type="text"
                value={reauctionPriceInput}
                onChange={e => setReauctionPriceInput(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm font-mono-num text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleReauctionSubmit(false)}
                className="py-2.5 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-extrabold text-xs uppercase cursor-pointer"
              >
                Add to Top of Queue
              </button>
              <button
                type="button"
                onClick={() => handleReauctionSubmit(true)}
                className="py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase cursor-pointer"
              >
                Start Immediately
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TRANSFER PURCHASE MODAL */}
      {transferModalItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleTransferPurchase}
            className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">
                Transfer Purchase: {transferModalItem.name}
              </h3>
              <button type="button" onClick={() => setTransferModalItem(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Transfer To Team
              </label>
              <select
                value={transferTargetTeamId}
                onChange={e => setTransferTargetTeamId(e.target.value)}
                required
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
              >
                {(auction.teams || []).map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} (Available: {formatCurrency(t.remainingPurse, cur)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Purchase Amount
              </label>
              <input
                type="text"
                value={transferAmountInput}
                onChange={e => setTransferAmountInput(e.target.value)}
                required
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm font-mono-num text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTransferModalItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs uppercase cursor-pointer"
              >
                Confirm Transfer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PURSE ADJUSTMENT MODAL */}
      {purseModalTeam && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handlePurseAdjustment}
            className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">
                Purse Adjustment: {purseModalTeam.name}
              </h3>
              <button type="button" onClick={() => setPurseModalTeam(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPurseAdjType('ADD')}
                className={`py-2 rounded-xl text-xs font-extrabold uppercase cursor-pointer ${
                  purseAdjType === 'ADD'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-950 text-slate-400 border border-slate-800'
                }`}
              >
                + Add Funds
              </button>
              <button
                type="button"
                onClick={() => setPurseAdjType('DEDUCT')}
                className={`py-2 rounded-xl text-xs font-extrabold uppercase cursor-pointer ${
                  purseAdjType === 'DEDUCT'
                    ? 'bg-rose-500 text-white'
                    : 'bg-slate-950 text-slate-400 border border-slate-800'
                }`}
              >
                - Deduct Funds
              </button>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Amount
              </label>
              <input
                type="text"
                value={purseAdjAmount}
                onChange={e => setPurseAdjAmount(e.target.value)}
                placeholder="e.g. 25M"
                required
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm font-mono-num text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Mandatory Reason (Logged in Audit History)
              </label>
              <input
                type="text"
                value={purseAdjReason}
                onChange={e => setPurseAdjReason(e.target.value)}
                placeholder="e.g. Bonus challenge reward / Penalty deduction"
                required
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPurseModalTeam(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs uppercase cursor-pointer"
              >
                Apply Purse Adjustment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EDIT ITEM MODAL (Name, Base Price, Pool, Manual Image Replacement) */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveItemEdit}
            className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">Edit Item / Image</h3>
              <button type="button" onClick={() => setEditingItem(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">Name</label>
              <input
                type="text"
                value={editingItem.name}
                onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                required
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Base Price
                </label>
                <input
                  type="text"
                  value={editingItem.basePriceInput}
                  onChange={e => setEditingItem({ ...editingItem, basePriceInput: e.target.value })}
                  required
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm font-mono-num text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Pool / Category
                </label>
                <select
                  value={editingItem.poolName}
                  onChange={e => setEditingItem({ ...editingItem, poolName: e.target.value })}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                >
                  {(auction.pools || []).map(p => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Player Headshot (Upload File or Enter URL)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editingItem.imageUrl || ''}
                  onChange={e => setEditingItem({ ...editingItem, imageUrl: e.target.value })}
                  placeholder="Paste URL or upload local file..."
                  className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-white"
                />
                <label className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0">
                  <Camera className="w-3.5 h-3.5" />
                  <span>Upload</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => {
                        setEditingItem(prev => ({ ...prev, imageUrl: ev.target?.result }));
                      };
                      reader.readAsDataURL(file);
                    }}
                    className="hidden"
                  />
                </label>
              </div>
              {editingItem.imageUrl && (
                <div className="mt-2 flex items-center gap-3 p-2 rounded-xl bg-slate-950 border border-slate-800">
                  <img
                    src={editingItem.imageUrl}
                    alt="Preview"
                    className="w-12 h-12 rounded-lg object-cover border border-slate-700"
                  />
                  <span className="text-[11px] text-slate-400 truncate">
                    {editingItem.imageUrl.startsWith('data:')
                      ? 'Local photo attached (Ready to save)'
                      : editingItem.imageUrl}
                  </span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs uppercase cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EDIT TEAM MODAL */}
      {editingTeam && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveTeamEdit}
            className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">
                Edit Team: {editingTeam.name}
              </h3>
              <button type="button" onClick={() => setEditingTeam(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Team Name
              </label>
              <input
                type="text"
                value={editingTeam.name}
                onChange={e => setEditingTeam({ ...editingTeam, name: e.target.value })}
                required
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Team Code
                </label>
                <input
                  type="text"
                  value={editingTeam.code}
                  onChange={e =>
                    setEditingTeam({ ...editingTeam, code: e.target.value.toUpperCase() })
                  }
                  required
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm font-mono-num uppercase text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  PIN
                </label>
                <input
                  type="text"
                  value={editingTeam.pin || ''}
                  onChange={e => setEditingTeam({ ...editingTeam, pin: e.target.value })}
                  required
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm font-mono-num text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Starting Purse
                </label>
                <input
                  type="text"
                  value={editingTeam.startingPurseInput}
                  onChange={e =>
                    setEditingTeam({ ...editingTeam, startingPurseInput: e.target.value })
                  }
                  required
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm font-mono-num text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-purple-300 mb-1">
                  RTM Cards
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={editingTeam.rtmCardsTotalInput ?? editingTeam.rtmTotal ?? 0}
                  onChange={e =>
                    setEditingTeam({ ...editingTeam, rtmCardsTotalInput: e.target.value })
                  }
                  className="w-full rounded-xl bg-slate-950 border border-purple-500/40 px-3 py-2 text-sm font-mono-num text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Primary Colour
                </label>
                <input
                  type="color"
                  value={editingTeam.primaryColor}
                  onChange={e => setEditingTeam({ ...editingTeam, primaryColor: e.target.value })}
                  className="w-full h-9 rounded-xl bg-slate-950 border border-slate-800 p-1"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Secondary Colour
                </label>
                <input
                  type="color"
                  value={editingTeam.secondaryColor}
                  onChange={e => setEditingTeam({ ...editingTeam, secondaryColor: e.target.value })}
                  className="w-full h-9 rounded-xl bg-slate-950 border border-slate-800 p-1"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Team Logo / Crest (Upload Image or Enter URL)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editingTeam.logoUrl || ''}
                  onChange={e => setEditingTeam({ ...editingTeam, logoUrl: e.target.value })}
                  placeholder="Paste image URL or click Upload Logo..."
                  className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-white"
                />
                <label className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0">
                  <Camera className="w-3.5 h-3.5" />
                  <span>Upload Logo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => {
                        setEditingTeam(prev => ({ ...prev, logoUrl: ev.target?.result }));
                      };
                      reader.readAsDataURL(file);
                    }}
                    className="hidden"
                  />
                </label>
              </div>
              {editingTeam.logoUrl && (
                <div className="mt-2 flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={editingTeam.logoUrl}
                      alt="Logo Preview"
                      className="w-10 h-10 rounded-lg object-contain bg-slate-900 border border-slate-700 p-0.5 shrink-0"
                    />
                    <span className="text-[11px] text-slate-400 truncate">
                      {editingTeam.logoUrl.startsWith('data:')
                        ? 'Custom logo image attached (Ready to save)'
                        : editingTeam.logoUrl}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingTeam(prev => ({ ...prev, logoUrl: '' }))}
                    className="text-xs text-rose-400 hover:text-rose-300 font-bold shrink-0 px-2 py-1"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTeam(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs uppercase cursor-pointer"
              >
                Save Team
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DRAG & DROP / QUICK RETAIN — SET RETENTION PRICE MODAL */}
      {retentionPriceModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmRetentionPriceModal}
            className="w-full max-w-md rounded-3xl bg-slate-900 border border-amber-500/40 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400">
                  {retentionPriceModal.mode === 'MOVE'
                    ? 'Move / Update Retention'
                    : 'Assign Retention & Set Price'}
                </span>
                <h3 className="font-display text-lg font-bold text-white">
                  {retentionPriceModal.playerName}
                </h3>
              </div>
              <button type="button" onClick={() => setRetentionPriceModal(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Franchise / Team
              </label>
              <select
                value={retentionPriceModal.teamId}
                onChange={e => {
                  const selectedTeam = (auction.teams || []).find(t => t.id === e.target.value);
                  setRetentionPriceModal({
                    ...retentionPriceModal,
                    teamId: e.target.value,
                    teamName: selectedTeam?.name || retentionPriceModal.teamName
                  });
                }}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
              >
                {(auction.teams || []).map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.retentionsCount}/{auction.maxRetentionsPerTeam} retained • Purse:{' '}
                    {formatCurrency(t.remainingPurse, cur)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Set Retention Price (Deducted from Team Purse)
              </label>
              <input
                type="text"
                autoFocus
                value={retentionPriceModal.amountInput}
                onChange={e =>
                  setRetentionPriceModal({
                    ...retentionPriceModal,
                    amountInput: e.target.value
                  })
                }
                placeholder={cur === 'INR' ? 'e.g. 18Cr' : 'e.g. 65M'}
                required
                className="w-full rounded-xl bg-slate-950 border border-amber-500/50 px-3.5 py-2.5 text-base font-mono-num font-bold text-amber-300 focus:outline-none"
              />
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {getRetentionPricePresets().map(preset => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() =>
                      setRetentionPriceModal({
                        ...retentionPriceModal,
                        amountInput: preset.value
                      })
                    }
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono-num font-bold border transition cursor-pointer ${
                      retentionPriceModal.amountInput === preset.value
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-amber-500/40'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRetentionPriceModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyAction}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase cursor-pointer"
              >
                Confirm & Set Price
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EDIT RETENTION MODAL */}
      {editingRetention && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveRetentionEdit}
            className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">
                Set / Edit Retention Price
              </h3>
              <button type="button" onClick={() => setEditingRetention(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Franchise / Team
              </label>
              <select
                value={editingRetention.teamId || ''}
                onChange={e =>
                  setEditingRetention({ ...editingRetention, teamId: e.target.value })
                }
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white"
              >
                {(auction.teams || []).map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.retentionsCount}/{auction.maxRetentionsPerTeam} retained)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Player / Item Name
              </label>
              <input
                type="text"
                value={editingRetention.playerName}
                onChange={e =>
                  setEditingRetention({ ...editingRetention, playerName: e.target.value })
                }
                required
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Retention Price / Amount
              </label>
              <input
                type="text"
                value={editingRetention.amountInput}
                onChange={e =>
                  setEditingRetention({ ...editingRetention, amountInput: e.target.value })
                }
                required
                className="w-full rounded-xl bg-slate-950 border border-amber-500/50 px-3.5 py-2 text-sm font-mono-num font-bold text-amber-300"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {getRetentionPricePresets().map(preset => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() =>
                      setEditingRetention({ ...editingRetention, amountInput: preset.value })
                    }
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono-num font-bold border transition cursor-pointer ${
                      editingRetention.amountInput === preset.value
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-amber-500/40'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingRetention(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs uppercase cursor-pointer"
              >
                Save Retention Price
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
