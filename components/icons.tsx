import {
  ArrowUpRight,
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CreditCard,
  Ellipsis,
  Gauge,
  Gpu,
  Headset,
  Key,
  LayoutDashboard,
  Link,
  LogOut,
  Mail,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  Users,
  X,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

export type IconProps = LucideProps;

// Keep admin sizing and decorative accessibility defaults consistent.
function createAdminIcon(Icon: LucideIcon) {
  return function AdminIcon(props: IconProps) {
    return <Icon aria-hidden="true" size={20} {...props} />;
  };
}

export const DashboardIcon = createAdminIcon(LayoutDashboard);
export const GpuIcon = createAdminIcon(Gpu);
export const UsersIcon = createAdminIcon(Users);
export const KeyIcon = createAdminIcon(Key);
// export const TierIcon = createAdminIcon(Layers);
export const TierIcon = createAdminIcon(CreditCard);
export const ProductIcon = createAdminIcon(Box);
export const SupportIcon = createAdminIcon(Headset);
export const ShieldIcon = createAdminIcon(ShieldCheck);
export const DeletionIcon = createAdminIcon(Trash2);
export const MailIcon = createAdminIcon(Mail);
export const AffiliateIcon = createAdminIcon(Link);
export const SparklesIcon = createAdminIcon(Sparkles);
export const SearchIcon = createAdminIcon(Search);
export const MenuIcon = createAdminIcon(Menu);
export const CloseIcon = createAdminIcon(X);
export const ChevronRightIcon = createAdminIcon(ChevronRight);
export const ChevronLeftIcon = createAdminIcon(ChevronLeft);
export const ChevronsRightIcon = createAdminIcon(ChevronsRight);
export const ChevronsLeftIcon = createAdminIcon(ChevronsLeft);
export const VelocityIcon = createAdminIcon(Gauge);
export const LogoutIcon = createAdminIcon(LogOut);
export const ArrowUpRightIcon = createAdminIcon(ArrowUpRight);
export const PlusIcon = createAdminIcon(Plus);
export const RefreshIcon = createAdminIcon(RefreshCw);
export const EditIcon = createAdminIcon(Pencil);
export const DeleteIcon = createAdminIcon(Trash2);
export const MoreIcon = createAdminIcon(Ellipsis);
export const CheckIcon = createAdminIcon(Check);
export const AlertIcon = createAdminIcon(TriangleAlert);
