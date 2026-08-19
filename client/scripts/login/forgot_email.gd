extends "res://scripts/ui/shell_page.gd"

@onready var _body: Label = $Center/VBox/Body
@onready var _name_edit: LineEdit = $Center/VBox/NameEdit
@onready var _lookup: Button = $Center/VBox/LookupButton
@onready var _status: Label = $Center/VBox/StatusLabel
@onready var _back: Button = $Center/VBox/BackButton


func _ready() -> void:
	super._ready()
	WindowManager.open(WindowManager.FORGOT_EMAIL)
	_body.text = "Forgot which email you used?\n\nWe cannot show your sign-in email from a character name or other public information.\n\nCheck likely inboxes for verification or account emails.\nSearch for the game’s official sender address.\nContact support and provide non-secret identifying information such as known character names.\nProvide a private recovery/support ID when one is available (your account user id if you saved it).\nSupport will require additional verification and will not reset a password without it."
	_name_edit.placeholder_text = "Character name (does not reveal an email)"
	_lookup.pressed.connect(_on_lookup)
	_back.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_LOGIN))


func _on_lookup() -> void:
	_status.text = "Support cannot reveal whether a character or email exists from this screen."
