class_name UxButton
extends Button

## Project-owned button variants. Never calls lifecycle RPCs itself.

enum Kind { PRIMARY, SECONDARY, DESTRUCTIVE }

@export var kind: Kind = Kind.PRIMARY
@export var click_only: bool = false


func _ready() -> void:
	_apply_kind()


func configure(next_kind: Kind, label: String = "", destructive_click_only: bool = false) -> void:
	kind = next_kind
	click_only = destructive_click_only
	if not label.is_empty():
		text = label
	_apply_kind()


func _apply_kind() -> void:
	match kind:
		Kind.SECONDARY:
			ShellTheme.style_secondary(self)
		Kind.DESTRUCTIVE:
			ShellTheme.style_destructive(self, click_only)
		_:
			ShellTheme.style_primary(self)
