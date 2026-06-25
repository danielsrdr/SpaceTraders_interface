/** Generated from SpaceTraders OpenAPI — run: node mcp/generate-endpoints.mjs */
export interface ApiEndpointMeta {
  method: string;
  path: string;
  operationId: string;
  tag: string;
  summary: string;
  description: string;
  pathParams: string[];
  queryParams: string[];
  requiresAuth: boolean;
}

export const API_ENDPOINT_TAGS: string[] = [
  "Global",
  "Systems",
  "Factions",
  "Agents",
  "Contracts",
  "Fleet",
  "Data"
];

export const API_ENDPOINTS: ApiEndpointMeta[] = [
  {
    "method": "GET",
    "path": "/",
    "operationId": "get-status",
    "tag": "Global",
    "summary": "Get Status",
    "description": "Return the status of the game server. This also includes a few global elements, such as announcements, server reset dates and leaderboards.",
    "pathParams": [],
    "queryParams": [],
    "requiresAuth": false
  },
  {
    "method": "POST",
    "path": "/register",
    "operationId": "register",
    "tag": "Global",
    "summary": "Register New Agent",
    "description": "Creates a new agent and ties it to an account. The agent symbol must consist of a 3-14 character string, and will be used to represent your agent. This symbol will prefix the symbol of every ship you own. Agent symbols will be cast to all uppercase characters. This new agent will be tied to a starting faction of your choice, which determines your starting location, and will be granted an authorization token, a contract with their starting faction, a command ship that can fly across space with advanced capabilities, a small probe ship that can be used for reconnaissance, and 175,000 credits. > #### Keep your token safe and secure > > Keep careful track of where you store your token. You can generate a new token from our account dashboard, but if someone else gains access to your token they will be able to use it to make API requests on your behalf until the end of the reset. If you are new to SpaceTraders, It is recommended to register with the COSMIC faction, a faction that is well connected to the rest of the universe. After registering, you should try our interactive [quickstart guide](https://docs.spacetraders.io/quickstart/new-game) which will walk you through a few basic API requests in just a few minutes.",
    "pathParams": [],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "GET",
    "path": "/systems",
    "operationId": "get-systems",
    "tag": "Systems",
    "summary": "List Systems",
    "description": "Return a paginated list of all systems.",
    "pathParams": [],
    "queryParams": [
      "page",
      "limit"
    ],
    "requiresAuth": false
  },
  {
    "method": "GET",
    "path": "/systems/{systemSymbol}",
    "operationId": "get-system",
    "tag": "Systems",
    "summary": "Get System",
    "description": "Get the details of a system.",
    "pathParams": [
      "systemSymbol"
    ],
    "queryParams": [],
    "requiresAuth": false
  },
  {
    "method": "GET",
    "path": "/systems/{systemSymbol}/waypoints",
    "operationId": "get-system-waypoints",
    "tag": "Systems",
    "summary": "List Waypoints in System",
    "description": "Return a paginated list of all of the waypoints for a given system. If a waypoint is uncharted, it will return the `Uncharted` trait instead of its actual traits.",
    "pathParams": [
      "systemSymbol"
    ],
    "queryParams": [
      "page",
      "limit",
      "type",
      "traits"
    ],
    "requiresAuth": false
  },
  {
    "method": "GET",
    "path": "/systems/{systemSymbol}/waypoints/{waypointSymbol}",
    "operationId": "get-waypoint",
    "tag": "Systems",
    "summary": "Get Waypoint",
    "description": "View the details of a waypoint. If the waypoint is uncharted, it will return the 'Uncharted' trait instead of its actual traits.",
    "pathParams": [
      "systemSymbol",
      "waypointSymbol"
    ],
    "queryParams": [],
    "requiresAuth": false
  },
  {
    "method": "GET",
    "path": "/systems/{systemSymbol}/waypoints/{waypointSymbol}/market",
    "operationId": "get-market",
    "tag": "Systems",
    "summary": "Get Market",
    "description": "Retrieve imports, exports and exchange data from a marketplace. Requires a waypoint that has the `Marketplace` trait to use. Send a ship to the waypoint to access trade good prices and recent transactions. Refer to the [Market Overview page](https://docs.spacetraders.io/game-concepts/markets) to gain better a understanding of the market in the game.",
    "pathParams": [
      "systemSymbol",
      "waypointSymbol"
    ],
    "queryParams": [],
    "requiresAuth": false
  },
  {
    "method": "GET",
    "path": "/systems/{systemSymbol}/waypoints/{waypointSymbol}/shipyard",
    "operationId": "get-shipyard",
    "tag": "Systems",
    "summary": "Get Shipyard",
    "description": "Get the shipyard for a waypoint. Requires a waypoint that has the `Shipyard` trait to use. Send a ship to the waypoint to access data on ships that are currently available for purchase and recent transactions.",
    "pathParams": [
      "systemSymbol",
      "waypointSymbol"
    ],
    "queryParams": [],
    "requiresAuth": false
  },
  {
    "method": "GET",
    "path": "/systems/{systemSymbol}/waypoints/{waypointSymbol}/jump-gate",
    "operationId": "get-jump-gate",
    "tag": "Systems",
    "summary": "Get Jump Gate",
    "description": "Get jump gate details for a waypoint. Requires a waypoint of type `JUMP_GATE` to use. Waypoints connected to this jump gate can be",
    "pathParams": [
      "systemSymbol",
      "waypointSymbol"
    ],
    "queryParams": [],
    "requiresAuth": false
  },
  {
    "method": "GET",
    "path": "/systems/{systemSymbol}/waypoints/{waypointSymbol}/construction",
    "operationId": "get-construction",
    "tag": "Systems",
    "summary": "Get Construction Site",
    "description": "Get construction details for a waypoint. Requires a waypoint with a property of `isUnderConstruction` to be true.",
    "pathParams": [
      "systemSymbol",
      "waypointSymbol"
    ],
    "queryParams": [],
    "requiresAuth": false
  },
  {
    "method": "POST",
    "path": "/systems/{systemSymbol}/waypoints/{waypointSymbol}/construction/supply",
    "operationId": "supply-construction",
    "tag": "Systems",
    "summary": "Supply Construction Site",
    "description": "Supply a construction site with the specified good. Requires a waypoint with a property of `isUnderConstruction` to be true. The good must be in your ship's cargo. The good will be removed from your ship's cargo and added to the construction site's materials.",
    "pathParams": [
      "systemSymbol",
      "waypointSymbol"
    ],
    "queryParams": [],
    "requiresAuth": false
  },
  {
    "method": "GET",
    "path": "/factions",
    "operationId": "get-factions",
    "tag": "Factions",
    "summary": "List Factions",
    "description": "Return a paginated list of all the factions in the game.",
    "pathParams": [],
    "queryParams": [
      "page",
      "limit"
    ],
    "requiresAuth": false
  },
  {
    "method": "GET",
    "path": "/factions/{factionSymbol}",
    "operationId": "get-faction",
    "tag": "Factions",
    "summary": "Get Faction",
    "description": "View the details of a faction.",
    "pathParams": [
      "factionSymbol"
    ],
    "queryParams": [],
    "requiresAuth": false
  },
  {
    "method": "GET",
    "path": "/my/agent",
    "operationId": "get-my-agent",
    "tag": "Agents",
    "summary": "Get Agent",
    "description": "Fetch your agent's details.",
    "pathParams": [],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "GET",
    "path": "/agents",
    "operationId": "get-agents",
    "tag": "Agents",
    "summary": "List Agents",
    "description": "Fetch agents details.",
    "pathParams": [],
    "queryParams": [
      "page",
      "limit"
    ],
    "requiresAuth": false
  },
  {
    "method": "GET",
    "path": "/agents/{agentSymbol}",
    "operationId": "get-agent",
    "tag": "Agents",
    "summary": "Get Public Agent",
    "description": "Fetch agent details.",
    "pathParams": [
      "agentSymbol"
    ],
    "queryParams": [],
    "requiresAuth": false
  },
  {
    "method": "GET",
    "path": "/my/contracts",
    "operationId": "get-contracts",
    "tag": "Contracts",
    "summary": "List Contracts",
    "description": "Return a paginated list of all your contracts.",
    "pathParams": [],
    "queryParams": [
      "page",
      "limit"
    ],
    "requiresAuth": true
  },
  {
    "method": "GET",
    "path": "/my/contracts/{contractId}",
    "operationId": "get-contract",
    "tag": "Contracts",
    "summary": "Get Contract",
    "description": "Get the details of a contract by ID.",
    "pathParams": [
      "contractId"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/contracts/{contractId}/accept",
    "operationId": "accept-contract",
    "tag": "Contracts",
    "summary": "Accept Contract",
    "description": "Accept a contract by ID. You can only accept contracts that were offered to you, were not accepted yet, and whose deadlines has not passed yet.",
    "pathParams": [
      "contractId"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/contracts/{contractId}/deliver",
    "operationId": "deliver-contract",
    "tag": "Contracts",
    "summary": "Deliver Cargo to Contract",
    "description": "Deliver cargo to a contract. In order to use this API, a ship must be at the delivery location (denoted in the delivery terms as `destinationSymbol` of a contract) and must have a number of units of a good required by this contract in its cargo. Cargo that was delivered will be removed from the ship's cargo.",
    "pathParams": [
      "contractId"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/contracts/{contractId}/fulfill",
    "operationId": "fulfill-contract",
    "tag": "Contracts",
    "summary": "Fulfill Contract",
    "description": "Fulfill a contract. Can only be used on contracts that have all of their delivery terms fulfilled.",
    "pathParams": [
      "contractId"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "GET",
    "path": "/my/ships",
    "operationId": "get-my-ships",
    "tag": "Fleet",
    "summary": "List Ships",
    "description": "Return a paginated list of all of ships under your agent's ownership.",
    "pathParams": [],
    "queryParams": [
      "page",
      "limit"
    ],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships",
    "operationId": "purchase-ship",
    "tag": "Fleet",
    "summary": "Purchase Ship",
    "description": "Purchase a ship from a Shipyard. In order to use this function, a ship under your agent's ownership must be in a waypoint that has the `Shipyard` trait, and the Shipyard must sell the type of the desired ship. Shipyards typically offer ship types, which are predefined templates of ships that have dedicated roles. A template comes with a preset of an engine, a reactor, and a frame. It may also include a few modules and mounts.",
    "pathParams": [],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "GET",
    "path": "/my/ships/{shipSymbol}",
    "operationId": "get-my-ship",
    "tag": "Fleet",
    "summary": "Get Ship",
    "description": "Retrieve the details of a ship under your agent's ownership.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "GET",
    "path": "/my/ships/{shipSymbol}/cargo",
    "operationId": "get-my-ship-cargo",
    "tag": "Fleet",
    "summary": "Get Ship Cargo",
    "description": "Retrieve the cargo of a ship under your agent's ownership.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/orbit",
    "operationId": "orbit-ship",
    "tag": "Fleet",
    "summary": "Orbit Ship",
    "description": "Attempt to move your ship into orbit at its current location. The request will only succeed if your ship is capable of moving into orbit at the time of the request. Orbiting ships are able to do actions that require the ship to be above surface such as navigating or extracting, but cannot access elements in their current waypoint, such as the market or a shipyard. The endpoint is idempotent - successive calls will succeed even if the ship is already in orbit.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/refine",
    "operationId": "ship-refine",
    "tag": "Fleet",
    "summary": "Ship Refine",
    "description": "Attempt to refine the raw materials on your ship. The request will only succeed if your ship is capable of refining at the time of the request. In order to be able to refine, a ship must have goods that can be refined and have installed a `Refinery` module that can refine it. When refining, 100 basic goods will be converted into 10 processed goods.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/chart",
    "operationId": "create-chart",
    "tag": "Fleet",
    "summary": "Create Chart",
    "description": "Command a ship to chart the waypoint at its current location. Most waypoints in the universe are uncharted by default. These waypoints have their traits hidden until they have been charted by a ship. Charting a waypoint will record your agent as the one who created the chart, and all other agents would also be able to see the waypoint's traits. Charting a waypoint gives you a one time reward of credits based on the rarity of the waypoint's traits.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "GET",
    "path": "/my/ships/{shipSymbol}/cooldown",
    "operationId": "get-ship-cooldown",
    "tag": "Fleet",
    "summary": "Get Ship Cooldown",
    "description": "Retrieve the details of your ship's reactor cooldown. Some actions such as activating your jump drive, scanning, or extracting resources taxes your reactor and results in a cooldown. Your ship cannot perform additional actions until your cooldown has expired. The duration of your cooldown is relative to the power consumption of the related modules or mounts for the action taken. Response returns a 204 status code (no-content) when the ship has no cooldown.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/dock",
    "operationId": "dock-ship",
    "tag": "Fleet",
    "summary": "Dock Ship",
    "description": "Attempt to dock your ship at its current location. Docking will only succeed if your ship is capable of docking at the time of the request. Docked ships can access elements in their current location, such as the market or a shipyard, but cannot do actions that require the ship to be above surface such as navigating or extracting. The endpoint is idempotent - successive calls will succeed even if the ship is already docked.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/survey",
    "operationId": "create-survey",
    "tag": "Fleet",
    "summary": "Create Survey",
    "description": "Create surveys on a waypoint that can be extracted such as asteroid fields. A survey focuses on specific types of deposits from the extracted location. When ships extract using this survey, they are guaranteed to procure a high amount of one of the goods in the survey. In order to use a survey, send the entire survey details in the body of the extract request. Each survey may have multiple deposits, and if a symbol shows up more than once, that indicates a higher chance of extracting that resource. Your ship will enter a cooldown after surveying in which it is unable to perform certain actions. Surveys will eventually expire after a period of time or will be exhausted after being extracted several times based on the survey's size. Multiple ships can use the same survey for extraction. A ship must have the `Surveyor` mount installed in order to use this function.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/extract",
    "operationId": "extract-resources",
    "tag": "Fleet",
    "summary": "Extract Resources",
    "description": "Extract resources from a waypoint that can be extracted, such as asteroid fields, into your ship. Send an optional survey as the payload to target specific yields. The ship must be in orbit to be able to extract and must have mining equipments installed that can extract goods, such as the `Gas Siphon` mount for gas-based goods or `Mining Laser` mount for ore-based goods. The survey property is now deprecated. See the `extract/survey` endpoint for more details.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/siphon",
    "operationId": "siphon-resources",
    "tag": "Fleet",
    "summary": "Siphon Resources",
    "description": "Siphon gases or other resources from gas giants. The ship must be in orbit to be able to siphon and must have siphon mounts and a gas processor installed.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/extract/survey",
    "operationId": "extract-resources-with-survey",
    "tag": "Fleet",
    "summary": "Extract Resources with Survey",
    "description": "Use a survey when extracting resources from a waypoint. This endpoint requires a survey as the payload, which allows your ship to extract specific yields. Send the full survey object as the payload which will be validated according to the signature. If the signature is invalid, or any properties of the survey are changed, the request will fail.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/jettison",
    "operationId": "jettison",
    "tag": "Fleet",
    "summary": "Jettison Cargo",
    "description": "Jettison cargo from your ship's cargo hold.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/jump",
    "operationId": "jump-ship",
    "tag": "Fleet",
    "summary": "Jump Ship",
    "description": "Jump your ship instantly to a target connected waypoint. The ship must be in orbit to execute a jump. A unit of antimatter is purchased and consumed from the market when jumping. The price of antimatter is determined by the market and is subject to change. A ship can only jump to connected waypoints",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/navigate",
    "operationId": "navigate-ship",
    "tag": "Fleet",
    "summary": "Navigate Ship",
    "description": "Navigate to a target destination. The ship must be in orbit to use this function. The destination waypoint must be within the same system as the ship's current location. Navigating will consume the necessary fuel from the ship's manifest based on the distance to the target waypoint. The returned response will detail the route information including the expected time of arrival. Most ship actions are unavailable until the ship has arrived at it's destination. To travel between systems, see the ship's Warp or Jump actions.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "PATCH",
    "path": "/my/ships/{shipSymbol}/nav",
    "operationId": "patch-ship-nav",
    "tag": "Fleet",
    "summary": "Patch Ship Nav",
    "description": "Update the nav configuration of a ship. Currently only supports configuring the Flight Mode of the ship, which affects its speed and fuel consumption.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "GET",
    "path": "/my/ships/{shipSymbol}/nav",
    "operationId": "get-ship-nav",
    "tag": "Fleet",
    "summary": "Get Ship Nav",
    "description": "Get the current nav status of a ship.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/warp",
    "operationId": "warp-ship",
    "tag": "Fleet",
    "summary": "Warp Ship",
    "description": "Warp your ship to a target destination in another system. The ship must be in orbit to use this function and must have the `Warp Drive` module installed. Warping will consume the necessary fuel from the ship's manifest. The returned response will detail the route information including the expected time of arrival. Most ship actions are unavailable until the ship has arrived at its destination.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/sell",
    "operationId": "sell-cargo",
    "tag": "Fleet",
    "summary": "Sell Cargo",
    "description": "Sell cargo in your ship to a market that trades this cargo. The ship must be docked in a waypoint that has the `Marketplace` trait in order to use this function.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/scan/systems",
    "operationId": "create-ship-system-scan",
    "tag": "Fleet",
    "summary": "Scan Systems",
    "description": "Scan for nearby systems, retrieving information on the systems' distance from the ship and their waypoints. Requires a ship to have the `Sensor Array` mount installed to use. The ship will enter a cooldown after using this function, during which it cannot execute certain actions.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/scan/waypoints",
    "operationId": "create-ship-waypoint-scan",
    "tag": "Fleet",
    "summary": "Scan Waypoints",
    "description": "Scan for nearby waypoints, retrieving detailed information on each waypoint in range. Scanning uncharted waypoints will allow you to ignore their uncharted state and will list the waypoints' traits. Requires a ship to have the `Sensor Array` mount installed to use. The ship will enter a cooldown after using this function, during which it cannot execute certain actions.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/scan/ships",
    "operationId": "create-ship-ship-scan",
    "tag": "Fleet",
    "summary": "Scan Ships",
    "description": "Scan for nearby ships, retrieving information for all ships in range. Requires a ship to have the `Sensor Array` mount installed to use. The ship will enter a cooldown after using this function, during which it cannot execute certain actions.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/refuel",
    "operationId": "refuel-ship",
    "tag": "Fleet",
    "summary": "Refuel Ship",
    "description": "Refuel your ship by buying fuel from the local market. Requires the ship to be docked in a waypoint that has the `Marketplace` trait, and the market must be selling fuel in order to refuel. Each fuel bought from the market replenishes 100 units in your ship's fuel. Ships will always be refuel to their frame's maximum fuel capacity when using this action.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/purchase",
    "operationId": "purchase-cargo",
    "tag": "Fleet",
    "summary": "Purchase Cargo",
    "description": "Purchase cargo from a market. The ship must be docked in a waypoint that has `Marketplace` trait, and the market must be selling a good to be able to purchase it. The maximum amount of units of a good that can be purchased in each transaction are denoted by the `tradeVolume` value of the good, which can be viewed by using the Get Market action. Purchased goods are added to the ship's cargo hold.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/transfer",
    "operationId": "transfer-cargo",
    "tag": "Fleet",
    "summary": "Transfer Cargo",
    "description": "Transfer cargo between ships. The receiving ship must be in the same waypoint as the transferring ship, and it must able to hold the additional cargo after the transfer is complete. Both ships also must be in the same state, either both are docked or both are orbiting. The response body's cargo shows the cargo of the transferring ship after the transfer is complete.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/negotiate/contract",
    "operationId": "negotiateContract",
    "tag": "Fleet",
    "summary": "Negotiate Contract",
    "description": "Negotiate a new contract with the HQ. In order to negotiate a new contract, an agent must not have ongoing or offered contracts over the allowed maximum amount. Currently the maximum contracts an agent can have at a time is 1. Once a contract is negotiated, it is added to the list of contracts offered to the agent, which the agent can then accept. The ship must be present at any waypoint with a faction present to negotiate a contract with that faction.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "GET",
    "path": "/my/ships/{shipSymbol}/mounts",
    "operationId": "get-mounts",
    "tag": "Fleet",
    "summary": "Get Mounts",
    "description": "Get the mounts installed on a ship.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/mounts/install",
    "operationId": "install-mount",
    "tag": "Fleet",
    "summary": "Install Mount",
    "description": "Install a mount on a ship. In order to install a mount, the ship must be docked and located in a waypoint that has a `Shipyard` trait. The ship also must have the mount to install in its cargo hold. An installation fee will be deduced by the Shipyard for installing the mount on the ship.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/mounts/remove",
    "operationId": "remove-mount",
    "tag": "Fleet",
    "summary": "Remove Mount",
    "description": "Remove a mount from a ship. The ship must be docked in a waypoint that has the `Shipyard` trait, and must have the desired mount that it wish to remove installed. A removal fee will be deduced from the agent by the Shipyard.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "GET",
    "path": "/my/ships/{shipSymbol}/scrap",
    "operationId": "get-scrap-ship",
    "tag": "Fleet",
    "summary": "Get Scrap Ship",
    "description": "Get the amount of value that will be returned when scrapping a ship.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/scrap",
    "operationId": "scrap-ship",
    "tag": "Fleet",
    "summary": "Scrap Ship",
    "description": "Scrap a ship, removing it from the game and returning a portion of the ship's value to the agent. The ship must be docked in a waypoint that has the `Shipyard` trait in order to use this function. To preview the amount of value that will be returned, use the Get Ship action.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "GET",
    "path": "/my/ships/{shipSymbol}/repair",
    "operationId": "get-repair-ship",
    "tag": "Fleet",
    "summary": "Get Repair Ship",
    "description": "Get the cost of repairing a ship.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/repair",
    "operationId": "repair-ship",
    "tag": "Fleet",
    "summary": "Repair Ship",
    "description": "Repair a ship, restoring the ship to maximum condition. The ship must be docked at a waypoint that has the `Shipyard` trait in order to use this function. To preview the cost of repairing the ship, use the Get action.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "GET",
    "path": "/market/supply-chain",
    "operationId": "get-supply-chain",
    "tag": "Data",
    "summary": "Get Supply Chain",
    "description": "Describes which import and exports map to each other.",
    "pathParams": [],
    "queryParams": [],
    "requiresAuth": false
  },
  {
    "method": "GET",
    "path": "/my/ships/{shipSymbol}/modules",
    "operationId": "get-ship-modules",
    "tag": "Fleet",
    "summary": "Get Ship Modules",
    "description": "Get the modules installed on a ship.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/modules/install",
    "operationId": "install-ship-module",
    "tag": "Fleet",
    "summary": "Install Ship Module",
    "description": "Install a module on a ship. The module must be in your cargo.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  },
  {
    "method": "POST",
    "path": "/my/ships/{shipSymbol}/modules/remove",
    "operationId": "remove-ship-module",
    "tag": "Fleet",
    "summary": "Remove Ship Module",
    "description": "Remove a module from a ship. The module will be placed in cargo.",
    "pathParams": [
      "shipSymbol"
    ],
    "queryParams": [],
    "requiresAuth": true
  }
];
