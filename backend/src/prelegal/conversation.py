"""Keeping the assistant from leaving a turn hanging.

A drafting conversation only progresses if the assistant keeps asking for the
next thing it needs. Left to a prompt instruction alone it mostly does, and then
occasionally ends on a flat statement — "Noted, I've recorded Delaware as the
governing law." — leaving the user to work out that it is their move and what
they are supposed to say.

So the model reports whether it still needs anything, and that answer is held to
here. Appending a question rather than rejecting the turn is deliberate: the
reply is otherwise good, the patch it came with is already valid, and throwing
all of that away over a missing question mark would cost the user a turn and the
provider a call to fix punctuation.
"""

#: Used only when the assistant said it needs more but did not ask for it. It is
#: deliberately open: anything more specific would be a guess about which field
#: it meant to ask about, and a wrong guess reads worse than an open question.
FALLBACK_QUESTION = "What would you like to tell me next?"

#: Both are in use: the model writes ASCII, but a user's own words quoted back
#: can carry the full-width form.
_QUESTION_MARKS = ("?", "？")


def ensure_follow_up_question(reply: str, needs_follow_up: bool) -> str:
    """Return `reply`, guaranteed to end in a question if more is needed."""
    if not needs_follow_up:
        return reply

    trimmed = reply.rstrip()
    if trimmed.endswith(_QUESTION_MARKS):
        return reply
    return f"{trimmed} {FALLBACK_QUESTION}"
