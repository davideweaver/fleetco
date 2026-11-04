import {
  BarChart3,
  Briefcase,
  CalendarDays,
  Clock,
  FileText,
  LayoutGrid,
  Package,
  Receipt,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type Role = "owner" | "tech";
export type Pane = "list-detail" | "wide";

/**
 * ONE route table. The rail, the classic sidebar and the phone bottom bar are three
 * renderers over this array — never three hand-kept lists. VarsityBio keeps two
 * (`normalSections` and `mobileNormalNavItems`) and they have already drifted
 * ("Edit Page" vs "Edit"), which is the whole argument for this file.
 */
export type NavItem = {
  key: string;
  title: string;
  /** Shorter label for the rail and the bottom bar. */
  short: string;
  /** Technicians see fewer sections, and two of them are called something else. */
  titleTech?: string;
  icon: LucideIcon;
  path: string;
  pane: Pane;
  roles: Role[];
  /** Bottom-bar order. Lower wins; undefined means "behind More". */
  phone?: number;
  /** What the second column holds. Records are data; sections are sub-navigation. */
  listKind?: "records" | "sections";
  /** Rail grouping. With labels gone, a separator between groups is the only
      positional cue left, so it is doing real work. */
  group: "work" | "sales" | "shop" | "admin";
};

export const NAV: NavItem[] = [
  { key: "board", group: "work", title: "Job board", short: "Board", icon: LayoutGrid, path: "/app/board", pane: "wide", roles: ["owner"], phone: 1 },
  { key: "jobs", group: "work", title: "Jobs", titleTech: "My jobs", short: "Jobs", icon: Briefcase, path: "/app/jobs", pane: "list-detail", listKind: "records", roles: ["owner", "tech"], phone: 2 },
  { key: "schedule", group: "work", title: "Schedule", short: "Schedule", icon: CalendarDays, path: "/app/schedule", pane: "wide", roles: ["owner", "tech"], phone: 3 },
  { key: "estimates", group: "sales", title: "Estimates", short: "Estimates", icon: FileText, path: "/app/estimates", pane: "list-detail", listKind: "records", roles: ["owner"] },
  { key: "customers", group: "sales", title: "Customers", short: "Customers", icon: Users, path: "/app/customers", pane: "list-detail", listKind: "records", roles: ["owner"] },
  { key: "invoices", group: "sales", title: "Invoices", short: "Invoices", icon: Receipt, path: "/app/invoices", pane: "list-detail", listKind: "records", roles: ["owner"], phone: 4 },
  // list-detail for the owner's review, which selects an employee on the left; the
  // technician's own screen is one pane because they are the only person on it.
  { key: "time", group: "shop", title: "Time & payroll", titleTech: "Clock", short: "Time", icon: Clock, path: "/app/time", pane: "list-detail", roles: ["owner", "tech"], phone: 5 },
  { key: "materials", group: "shop", title: "Materials & ordering", short: "Materials", icon: Package, path: "/app/materials", pane: "list-detail", listKind: "records", roles: ["owner"] },
  { key: "reports", group: "admin", title: "Reports", short: "Reports", icon: BarChart3, path: "/app/reports", pane: "list-detail", listKind: "sections", roles: ["owner"] },
  { key: "settings", group: "admin", title: "Settings", short: "Settings", icon: Settings, path: "/app/settings", pane: "list-detail", listKind: "sections", roles: ["owner"] },
];

export const navFor = (role: Role) => NAV.filter((i) => i.roles.includes(role));

export const labelFor = (item: NavItem, role: Role) =>
  role === "tech" && item.titleTech ? item.titleTech : item.title;

/** The bottom bar shows four, and More carries the rest with their badges. */
export const phoneNavFor = (role: Role) =>
  navFor(role)
    .filter((i) => i.phone !== undefined)
    .sort((a, b) => (a.phone ?? 99) - (b.phone ?? 99))
    .slice(0, 4);

export const itemForPath = (pathname: string) =>
  NAV.find((i) => pathname === i.path || pathname.startsWith(i.path + "/"));

export const GROUP_ORDER = ["work", "sales", "shop", "admin"] as const;
