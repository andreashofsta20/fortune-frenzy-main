package cases

// CaseItem is one weighted row in cases_catalog.items JSON.
type CaseItem struct {
	ID      string  `json:"id"`
	Chance  float64 `json:"chance"`
	Claimed int64   `json:"claimed"`
	Value   int64   `json:"value"` // Filled from items.value (Rolimons) when serving cases
}

type CaseUIData struct {
	Primary string `json:"primary"`
	Colour  string `json:"colour"`
}

type CaseData struct {
	ID               string     `json:"id"`
	Price            int64      `json:"price"`
	Items            []CaseItem `json:"items"`
	NextRotation     string     `json:"next_rotation"`
	UIData           CaseUIData `json:"ui_data"`
	OpenedCount      int64      `json:"opened_count"`
	MinValue         int64      `json:"min_value"`
	MaxValue         int64      `json:"max_value"`
	AvailableForGems bool       `json:"available_for_gems"`
	DevProduct       string     `json:"dev_product"`
	VipOnly          bool       `json:"vip_only"`
}

type OpenCaseRequestBody struct {
	UserID        string `json:"user_id"`
	Lucky         bool   `json:"lucky"`
	VIPSubscribed bool   `json:"vip_subscribed"`
}
