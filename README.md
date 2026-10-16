# VISTA PRESENTS THE VERDICT — Universal Multi-Committee Live Auction Platform (NMAMIT)

A production-ready, real-time, universal multi-committee auction and bidding platform built for **Vista Presents The Verdict** at **NMAMIT**.

## Running the Platform

The server is currently running at **`http://localhost:3000`**.

- **Production / Standard Start**:
  ```bash
  npm start
  ```
- **Development Mode (Live HMR)**:
  ```bash
  npm run dev
  ```
- **Reset & Re-seed Database**:
  ```bash
  npm run seed
  ```

---

## Default Role Credentials

### 1. Administrator Accounts (Email + Password)
| Role | Email | Password | Capabilities |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `superadmin@vista.nmamit.in` | `vista2027` | Full platform governance, create/delete auctions, manage committee admins, currencies, logo library, global audit logs |
| **Auctioneer** | `auctioneer@vista.nmamit.in` | `vista2027` | Full auction flow & bidding control, projector launcher, queue, retentions, teams, corrections |
| **Bid Operator** | `operator@vista.nmamit.in` | `vista2027` | Full auction flow & bidding control identical to Auctioneer, synchronized in real time |

### 2. Football Auction Team Logins (`Team Code` + `PIN`)
| Club | Team Code | PIN | Official Colours | Starting Purse |
| :--- | :--- | :--- | :--- | :--- |
| **Real Madrid** | `RMA` | `1001` | `#FEBE10` / `#00529F` | €1 Billion |
| **Barcelona** | `BAR` | `1002` | `#A50044` / `#004D98` | €1 Billion |
| **Manchester City** | `MCI` | `1003` | `#6CABDD` / `#1C2C5B` | €1 Billion |
| **Arsenal** | `ARS` | `1004` | `#EF0107` / `#063672` | €1 Billion |
| **Bayern Munich** | `BAY` | `1005` | `#DC052D` / `#0066B2` | €1 Billion |
| **PSG** | `PSG` | `1006` | `#004170` / `#DA291C` | €1 Billion |
| **Manchester United** | `MUN` | `1007` | `#DA291C` / `#FBE122` | €1 Billion |
| **AC Milan** | `MIL` | `1008` | `#FB090B` / `#111111` | €1 Billion |
