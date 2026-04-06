package models

type UserInfo struct {
	ID          *string `json:"id"`
	Username    *string `json:"username,omitempty"`
	DisplayName *string `json:"display_name,omitempty"`
}
